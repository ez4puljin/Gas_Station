import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computePayroll, type RunPayrollInput, type SetSalaryInput } from '@fuel/schemas';
import { AuditAction, type AuthUser, JournalSource, STD_ACCOUNT } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';

interface ComputedItem {
  employeeId: string;
  name: string;
  baseSalaryMnt: bigint;
  bonusMnt: bigint;
  grossMnt: bigint;
  employeeNdshMnt: bigint;
  pitMnt: bigint;
  employerNdshMnt: bigint;
  netMnt: bigint;
}

/**
 * Цалин — сарын тооцоо: НДШ/ХХОАТ суутгал (computePayroll) + GL-д бичих.
 * GL: Дт цалин зардал (7100) + НДШ зардал (7110) = Кт цалингийн өглөг (3300) + татварын өглөг (3310).
 * Нэг компани+сар нэг удаа (давхар тооцооноос сэргийлнэ). Бүх дүн integer MNT (§2.1).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
  ) {}

  // ── Ажилтны цалин ──
  listEmployees(user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, status: true, baseSalaryMnt: true },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
    });
  }

  async setSalary(user: AuthUser, employeeId: string, input: SetSalaryInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      const emp = await tx.employee.update({ where: { id: employeeId }, data: { baseSalaryMnt: input.baseSalaryMnt } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'Employee', entityId: employeeId, before: { baseSalaryMnt: before.baseSalaryMnt }, after: { baseSalaryMnt: emp.baseSalaryMnt }, ip },
        tx,
      );
      return emp;
    });
  }

  // ── Тооцоо ──
  private async computeFor(user: AuthUser, bonuses?: { employeeId: string; amountMnt: bigint }[]): Promise<ComputedItem[]> {
    const bonusBy = new Map((bonuses ?? []).map((b) => [b.employeeId, b.amountMnt]));
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, baseSalaryMnt: true },
    });
    const items: ComputedItem[] = [];
    for (const e of employees) {
      const bonus = bonusBy.get(e.id) ?? 0n;
      const gross = e.baseSalaryMnt + bonus;
      if (gross <= 0n) continue;
      const r = computePayroll(gross);
      items.push({
        employeeId: e.id,
        name: `${e.lastName} ${e.firstName}`,
        baseSalaryMnt: e.baseSalaryMnt,
        bonusMnt: bonus,
        grossMnt: r.grossMnt,
        employeeNdshMnt: r.employeeNdshMnt,
        pitMnt: r.pitMnt,
        employerNdshMnt: r.employerNdshMnt,
        netMnt: r.netMnt,
      });
    }
    return items;
  }

  private totals(items: ComputedItem[]) {
    return items.reduce(
      (a, i) => ({
        grossMnt: a.grossMnt + i.grossMnt,
        employeeNdshMnt: a.employeeNdshMnt + i.employeeNdshMnt,
        pitMnt: a.pitMnt + i.pitMnt,
        employerNdshMnt: a.employerNdshMnt + i.employerNdshMnt,
        netMnt: a.netMnt + i.netMnt,
      }),
      { grossMnt: 0n, employeeNdshMnt: 0n, pitMnt: 0n, employerNdshMnt: 0n, netMnt: 0n },
    );
  }

  /** Тооцоог урьдчилан харах (бичихгүй). */
  async preview(user: AuthUser, period: string) {
    const existing = await this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: user.companyId, period } } });
    const items = await this.computeFor(user);
    return { period, posted: !!existing, items, totals: this.totals(items) };
  }

  /** Сарын цалинг тооцоолж GL-д бичих. */
  async run(user: AuthUser, input: RunPayrollInput, ip: string | null) {
    const existing = await this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: user.companyId, period: input.period } } });
    if (existing) throw new BadRequestException({ code: 'PAYROLL_ALREADY_RUN', message: 'Энэ сарын цалин аль хэдийн тооцоологдсон' });

    const items = await this.computeFor(user, input.bonuses);
    if (items.length === 0) throw new BadRequestException({ code: 'NO_PAYROLL', message: 'Цалинтай идэвхтэй ажилтан алга' });
    const t = this.totals(items);
    await this.accounting.ensureChartOfAccounts(user.companyId);
    const date = new Date(`${input.period}-01T00:00:00+08:00`);

    return this.prisma.$transaction(async (tx) => {
      const taxPayable = t.employeeNdshMnt + t.employerNdshMnt + t.pitMnt;
      const entry = await this.accounting.postJournalInTx(tx, {
        companyId: user.companyId,
        date,
        source: JournalSource.PAYROLL,
        memo: `Цалин ${input.period}`,
        refType: 'payroll',
        createdById: user.sub,
        lines: [
          { accountCode: STD_ACCOUNT.WAGES, debitMnt: t.grossMnt },
          { accountCode: STD_ACCOUNT.SOCIAL_INS_EXP, debitMnt: t.employerNdshMnt },
          { accountCode: STD_ACCOUNT.PAYROLL_PAYABLE, creditMnt: t.netMnt },
          { accountCode: STD_ACCOUNT.TAX_PAYABLE, creditMnt: taxPayable },
        ],
      });
      const payrollRun = await tx.payrollRun.create({
        data: {
          companyId: user.companyId,
          period: input.period,
          grossMnt: t.grossMnt,
          employeeNdshMnt: t.employeeNdshMnt,
          pitMnt: t.pitMnt,
          employerNdshMnt: t.employerNdshMnt,
          netMnt: t.netMnt,
          journalEntryId: entry.id,
          runById: user.sub,
          items: {
            create: items.map((i) => ({
              employeeId: i.employeeId,
              baseSalaryMnt: i.baseSalaryMnt,
              bonusMnt: i.bonusMnt,
              grossMnt: i.grossMnt,
              employeeNdshMnt: i.employeeNdshMnt,
              pitMnt: i.pitMnt,
              employerNdshMnt: i.employerNdshMnt,
              netMnt: i.netMnt,
            })),
          },
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: 'PAYROLL_RUN', entity: 'PayrollRun', entityId: payrollRun.id, after: { period: input.period, ...t, journalEntryId: entry.id }, ip },
        tx,
      );
      return { ...payrollRun, itemCount: items.length };
    });
  }

  /** Цалингийн тооцоог буцаах — GL журналыг буцааж + бичлэгийг устгана (дахин тооцоолж болно). */
  async reverse(user: AuthUser, id: string, ip: string | null) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, companyId: user.companyId } });
    if (!run) throw new NotFoundException({ code: 'PAYROLL_NOT_FOUND', message: 'Цалингийн тооцоо олдсонгүй' });
    return this.prisma.$transaction(async (tx) => {
      if (run.journalEntryId) {
        const orig = await tx.journalEntry.findUnique({
          where: { id: run.journalEntryId },
          include: { lines: { include: { account: { select: { code: true } } } } },
        });
        if (orig && !orig.reversedId) {
          const rev = await this.accounting.postJournalInTx(tx, {
            companyId: user.companyId,
            date: new Date(),
            source: JournalSource.ADJUSTMENT,
            memo: `Цалин буцаах: ${orig.entryNo}`,
            refType: 'reversal',
            refId: orig.id,
            createdById: user.sub,
            lines: orig.lines.map((l) => ({ accountCode: l.account.code, debitMnt: l.creditMnt, creditMnt: l.debitMnt })),
          });
          await tx.journalEntry.update({ where: { id: orig.id }, data: { reversedId: rev.id } });
        }
      }
      await tx.payrollRun.delete({ where: { id: run.id } });
      await this.audit.record(
        { actorId: user.sub, action: 'PAYROLL_REVERSE', entity: 'PayrollRun', entityId: run.id, before: run, ip },
        tx,
      );
      return { reversed: true };
    });
  }

  async listRuns(user: AuthUser) {
    return this.prisma.payrollRun.findMany({
      where: { companyId: user.companyId },
      orderBy: { period: 'desc' },
      take: 36,
    });
  }

  async getRun(user: AuthUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId: user.companyId },
      include: { items: { include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } } } },
    });
    if (!run) throw new NotFoundException({ code: 'PAYROLL_NOT_FOUND', message: 'Цалингийн тооцоо олдсонгүй' });
    return run;
  }
}
