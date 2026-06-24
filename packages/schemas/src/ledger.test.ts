import { describe, expect, it } from 'vitest';
import { ledgerBalanceColumns, ledgerClosing, ledgerGrossColumns } from './ledger';

describe('ledgerGrossColumns — гүйлгээний дебет/кредит', () => {
  it('авлага (debit): debit→дебет, credit→кредит (swap үгүй)', () => {
    expect(ledgerGrossColumns('debit', 100n, 0n)).toEqual({ debit: 100n, credit: 0n });
    expect(ledgerGrossColumns('debit', 0n, 40n)).toEqual({ debit: 0n, credit: 40n });
  });

  it('өглөг (credit): RECEIPT (raw debit) → КРЕДИТ, PAYMENT (raw credit) → ДЕБЕТ (swap)', () => {
    // raw debit = өглөг нэмэгдсэн → кредит талд
    expect(ledgerGrossColumns('credit', 100n, 0n)).toEqual({ debit: 0n, credit: 100n });
    // raw credit = төлбөр → дебет талд
    expect(ledgerGrossColumns('credit', 0n, 40n)).toEqual({ debit: 40n, credit: 0n });
  });
});

describe('ledgerBalanceColumns — үлдэгдлийн дебет/кредит хуваалт', () => {
  it('авлага (debit): эерэг → дебет, сөрөг → кредит', () => {
    expect(ledgerBalanceColumns('debit', 150n)).toEqual({ debit: 150n, credit: 0n });
    expect(ledgerBalanceColumns('debit', -150n)).toEqual({ debit: 0n, credit: 150n });
    expect(ledgerBalanceColumns('debit', 0n)).toEqual({ debit: 0n, credit: 0n });
  });

  it('өглөг (credit): эерэг → кредит, сөрөг → дебет', () => {
    expect(ledgerBalanceColumns('credit', 150n)).toEqual({ debit: 0n, credit: 150n });
    expect(ledgerBalanceColumns('credit', -150n)).toEqual({ debit: 150n, credit: 0n });
  });
});

describe('ledgerClosing — эцсийн = эхний + дебет − кредит (§12)', () => {
  it('энгийн', () => {
    expect(ledgerClosing(100n, 66n, 0n)).toBe(166n);
    expect(ledgerClosing(0n, 51_750_000n, 20_000_000n)).toBe(31_750_000n);
  });

  it('сөрөг рүү (өглөг барагдсан)', () => {
    expect(ledgerClosing(50n, 0n, 80n)).toBe(-30n);
  });
});

describe('инвариант: AR vs AP толдол', () => {
  it('ижил тоон утга өөр nature дээр эсрэг талд буудаг', () => {
    const ar = ledgerBalanceColumns('debit', 1000n);
    const ap = ledgerBalanceColumns('credit', 1000n);
    expect(ar.debit).toBe(ap.credit);
    expect(ar.credit).toBe(ap.debit);
  });
});
