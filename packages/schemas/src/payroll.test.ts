import { describe, expect, it } from 'vitest';
import { computePayroll, DEFAULT_PAYROLL_SETTINGS } from './payroll';

describe('computePayroll — НДШ + ХХОАТ', () => {
  it('1,000,000₮ цалин (өгөгдмөл хувь)', () => {
    const r = computePayroll(1_000_000n);
    expect(r.employeeNdshMnt).toBe(115_000n); // 11.5%
    expect(r.employerNdshMnt).toBe(130_000n); // 13%
    expect(r.taxableMnt).toBe(885_000n); // 1,000,000 − 115,000
    expect(r.pitMnt).toBe(68_500n); // 885,000×10% − 20,000 хөнгөлөлт
    expect(r.netMnt).toBe(816_500n); // gross − НДШ − ХХОАТ
  });

  it('бага цалин: ХХОАТ хөнгөлөлтөөс бага → 0', () => {
    const r = computePayroll(100_000n);
    expect(r.employeeNdshMnt).toBe(11_500n);
    expect(r.pitMnt).toBe(0n); // 88,500×10%=8,850 < 20,000 хөнгөлөлт
    expect(r.netMnt).toBe(88_500n);
  });

  it('тэг цалин → бүгд тэг', () => {
    const r = computePayroll(0n);
    expect(r.netMnt).toBe(0n);
    expect(r.pitMnt).toBe(0n);
  });

  it('GL тэнцэл: gross + employerНДШ = net + empНДШ + employerНДШ + ХХОАТ', () => {
    const r = computePayroll(1_500_000n);
    const dr = r.grossMnt + r.employerNdshMnt;
    const cr = r.netMnt + r.employeeNdshMnt + r.employerNdshMnt + r.pitMnt;
    expect(dr).toBe(cr);
  });

  it('сөрөг цалин татгалзана', () => {
    expect(() => computePayroll(-1n)).toThrow();
  });

  it('хувь хэмжээ тохируулж болно', () => {
    const r = computePayroll(1_000_000n, { ...DEFAULT_PAYROLL_SETTINGS, pitCreditMnt: 0n });
    expect(r.pitMnt).toBe(88_500n); // хөнгөлөлтгүй
  });
});
