/**
 * Тооцооны дэвтрийн (AR/AP) дебет/кредит логик — нэг эх сурвалж, цэвэр функц (тестлэгдэх).
 * `nature='debit'`  = авлага (харилцагч; дебет талын данс): эерэг үлдэгдэл → дебет.
 * `nature='credit'` = өглөг (нийлүүлэгч; кредит талын данс): эерэг үлдэгдэл → кредит.
 * Бүх дүн integer MNT (bigint) — float ашиглахгүй (§2.1).
 */
export type LedgerNature = 'debit' | 'credit';

export interface LedgerColumns {
  debit: bigint;
  credit: bigint;
}

/**
 * Гүйлгээний raw дебет/кредитийг (amount>0 → debit, |amount<0| → credit) дансны мөн чанараар
 * харагдах багана руу буулгана. Өглөгийн данс дээр RECEIPT (нэмэгдэл) нь КРЕДИТ талд буудаг тул swap.
 */
export function ledgerGrossColumns(nature: LedgerNature, debit: bigint, credit: bigint): LedgerColumns {
  return nature === 'debit' ? { debit, credit } : { debit: credit, credit: debit };
}

/** Тэмдэгтэй үлдэгдлийг дансны мөн чанараар дебет/кредит баганад хуваана (нөгөө багана нь 0). */
export function ledgerBalanceColumns(nature: LedgerNature, balance: bigint): LedgerColumns {
  if (nature === 'debit') {
    return { debit: balance > 0n ? balance : 0n, credit: balance < 0n ? -balance : 0n };
  }
  return { debit: balance < 0n ? -balance : 0n, credit: balance > 0n ? balance : 0n };
}

/** Эцсийн үлдэгдэл = эхний + нийт дебет − нийт кредит (§12). */
export function ledgerClosing(openingMnt: bigint, totalDebitMnt: bigint, totalCreditMnt: bigint): bigint {
  return openingMnt + totalDebitMnt - totalCreditMnt;
}
