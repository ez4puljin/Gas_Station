import { divRoundHalfUp } from './money';

/**
 * Цалингийн тооцоо — Монголын НДШ (нийгмийн даатгал) + ХХОАТ (хувь хүний орлогын албан татвар).
 * Хувь хэмжээ нь basis point (bp): 1150 = 11.5%, 1000 = 10%. Bigint дээр (float үгүй §2.1).
 *
 * ⚠️ Хувь хэмжээ ЖИЛ БҮР өөрчлөгддөг — DEFAULT_PAYROLL_SETTINGS-ийг тухайн оны хуулиар
 * шалгаж тохируулна. Тооцооны логик нь хувь хэмжээнээс хамаарахгүй.
 */
export interface PayrollSettings {
  ndshEmployeeBp: number; // ажилтны НД шимтгэл (bp)
  ndshEmployerBp: number; // ажил олгогчийн НДШ (bp)
  pitBp: number; // ХХОАТ (bp)
  pitCreditMnt: bigint; // сарын татварын хөнгөлөлт (ХХОАТ-аас хасна)
}

/** Өгөгдмөл — тухайн оны хуулиар ШАЛГАЖ тохируулна. */
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  ndshEmployeeBp: 1150, // 11.5%
  ndshEmployerBp: 1300, // 13.0%
  pitBp: 1000, // 10%
  pitCreditMnt: 20_000n, // 20,000₮/сар
};

export interface PayrollResult {
  grossMnt: bigint;
  employeeNdshMnt: bigint; // ажилтнаас суутгах НДШ
  taxableMnt: bigint; // НДШ-ийн дараах татвар ногдох
  pitMnt: bigint; // ХХОАТ
  employerNdshMnt: bigint; // ажил олгогчийн НДШ (зардал)
  netMnt: bigint; // гарт олгох (gross − НДШ − ХХОАТ)
}

/**
 * Нэг ажилтны нэг сарын цалин бодно.
 * НДШ(ажилтан) = gross × ndshEmployeeBp; татвар ногдох = gross − НДШ(ажилтан);
 * ХХОАТ = max(0, татвар ногдох × pitBp − хөнгөлөлт); гарт = gross − НДШ(ажилтан) − ХХОАТ.
 */
export function computePayroll(grossMnt: bigint, s: PayrollSettings = DEFAULT_PAYROLL_SETTINGS): PayrollResult {
  if (grossMnt < 0n) throw new Error('Цалин сөрөг байж болохгүй');
  const employeeNdshMnt = divRoundHalfUp(grossMnt * BigInt(s.ndshEmployeeBp), 10_000n);
  const employerNdshMnt = divRoundHalfUp(grossMnt * BigInt(s.ndshEmployerBp), 10_000n);
  const taxableMnt = grossMnt - employeeNdshMnt;
  let pitMnt = divRoundHalfUp(taxableMnt * BigInt(s.pitBp), 10_000n) - s.pitCreditMnt;
  if (pitMnt < 0n) pitMnt = 0n;
  const netMnt = grossMnt - employeeNdshMnt - pitMnt;
  return { grossMnt, employeeNdshMnt, taxableMnt, pitMnt, employerNdshMnt, netMnt };
}
