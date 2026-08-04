import { describe, expect, it } from 'vitest';
import { allocateDeductions, outstandingMnt, varianceKind } from './cash-accountability';

describe('varianceKind', () => {
  it('сөрөг = дутагдал', () => expect(varianceKind(-5000n)).toBe('SHORTAGE'));
  it('эерэг = илүүдэл', () => expect(varianceKind(5000n)).toBe('OVERAGE'));
  it('тэг = зөрүүгүй', () => expect(varianceKind(0n)).toBe('NONE'));
});

describe('outstandingMnt', () => {
  it('нөхөөгүй', () => expect(outstandingMnt(5000n, 0n)).toBe(5000n));
  it('хэсэгчлэн нөхсөн', () => expect(outstandingMnt(5000n, 2000n)).toBe(3000n));
  it('бүрэн нөхсөн → 0', () => expect(outstandingMnt(5000n, 5000n)).toBe(0n));
  it('илүү нөхсөн → 0 (сөрөг болохгүй)', () => expect(outstandingMnt(5000n, 7000n)).toBe(0n));
});

describe('allocateDeductions', () => {
  it('гарт олгох хангалттай бол бүгдийг суутгана', () => {
    const r = allocateDeductions(800_000n, [
      { id: 'a', amountMnt: 5_000n, recoveredMnt: 0n },
      { id: 'b', amountMnt: 12_000n, recoveredMnt: 0n },
    ]);
    expect(r.totalMnt).toBe(17_000n);
    expect(r.allocations).toEqual([
      { caseId: 'a', deductMnt: 5_000n, fullySettled: true },
      { caseId: 'b', deductMnt: 12_000n, fullySettled: true },
    ]);
  });

  it('гарт олгохоос ХЭТРЭХГҮЙ — хэсэгчлэн суутгана', () => {
    const r = allocateDeductions(8_000n, [
      { id: 'a', amountMnt: 5_000n, recoveredMnt: 0n },
      { id: 'b', amountMnt: 12_000n, recoveredMnt: 0n },
    ]);
    expect(r.totalMnt).toBe(8_000n);
    expect(r.allocations).toEqual([
      { caseId: 'a', deductMnt: 5_000n, fullySettled: true },
      { caseId: 'b', deductMnt: 3_000n, fullySettled: false }, // үлдэгдэл 9,000 дараа сард
    ]);
  });

  it('өмнө нь хэсэгчлэн суутгасныг тооцно', () => {
    const r = allocateDeductions(100_000n, [{ id: 'a', amountMnt: 12_000n, recoveredMnt: 3_000n }]);
    expect(r.totalMnt).toBe(9_000n);
    expect(r.allocations[0]).toEqual({ caseId: 'a', deductMnt: 9_000n, fullySettled: true });
  });

  it('гарт олгох 0 бол суутгахгүй', () => {
    const r = allocateDeductions(0n, [{ id: 'a', amountMnt: 5_000n, recoveredMnt: 0n }]);
    expect(r.totalMnt).toBe(0n);
    expect(r.allocations).toEqual([]);
  });

  it('сөрөг гарт олгохыг 0 гэж үзнэ', () => {
    expect(allocateDeductions(-1n, [{ id: 'a', amountMnt: 5_000n, recoveredMnt: 0n }]).totalMnt).toBe(0n);
  });

  it('бүрэн нөхөгдсөн хэргийг алгасана', () => {
    const r = allocateDeductions(100_000n, [
      { id: 'done', amountMnt: 5_000n, recoveredMnt: 5_000n },
      { id: 'b', amountMnt: 4_000n, recoveredMnt: 0n },
    ]);
    expect(r.totalMnt).toBe(4_000n);
    expect(r.allocations).toEqual([{ caseId: 'b', deductMnt: 4_000n, fullySettled: true }]);
  });

  it('хэрэг байхгүй бол 0', () => {
    expect(allocateDeductions(500_000n, []).totalMnt).toBe(0n);
  });
});
