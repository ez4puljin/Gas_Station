import { describe, expect, it } from 'vitest';
import {
  cleanCounterpart,
  detectColumns,
  extractDate,
  isFeeDescription,
  isPosSettlement,
  parseBankRows,
  parseFilename,
  sumBankTxns,
  toMntAmount,
} from './bank-statement';

describe('isFeeDescription', () => {
  it('монгол түлхүүр үг', () => {
    expect(isFeeDescription('Гүйлгээний хураамж')).toBe(true);
    expect(isFeeDescription('Банкны шимтгэл')).toBe(true);
  });
  it('англи түлхүүр үг', () => expect(isFeeDescription('SERVICE FEE')).toBe(true));
  it('энгийн гүйлгээ', () => expect(isFeeDescription('Түлш худалдан авалт')).toBe(false));
  it('хоосон', () => expect(isFeeDescription('')).toBe(false));
});

describe('isPosSettlement', () => {
  it('SETTLEMENT таних', () => expect(isPosSettlement('POS SETTLEMENT 2026-08-01')).toBe(true));
  it('жижиг үсгээр ч', () => expect(isPosSettlement('pos settlement')).toBe(true));
  it('бусад', () => expect(isPosSettlement('Шилжүүлэг')).toBe(false));
});

describe('extractDate', () => {
  it('YYYY-MM-DD', () => expect(extractDate('Тооцоо 2026-08-05 өдрийн')?.toISOString().slice(0, 10)).toBe('2026-08-05'));
  it('DD/MM/YYYY (Монголд түгээмэл)', () => expect(extractDate('05/08/2026 гүйлгээ')?.toISOString().slice(0, 10)).toBe('2026-08-05'));
  it('буруу сар → null', () => expect(extractDate('2026-13-01')).toBeNull());
  it('огноогүй', () => expect(extractDate('шилжүүлэг')).toBeNull());
});

describe('toMntAmount — integer MNT (§2.1)', () => {
  it('бүхэл', () => expect(toMntAmount(150000)).toBe(150000n));
  it('аравтыг тоймлоно', () => expect(toMntAmount(1234.56)).toBe(1235n));
  it('таслалтай бичвэр', () => expect(toMntAmount("1'234,500")).toBe(1234500n));
  it('₮ тэмдэгтэй', () => expect(toMntAmount('45 000 ₮')).toBe(45000n));
  it('сөрөг дебитийг абсолютаар', () => expect(toMntAmount(-8000)).toBe(8000n));
  it('хоосон → 0', () => {
    expect(toMntAmount('')).toBe(0n);
    expect(toMntAmount(null)).toBe(0n);
    expect(toMntAmount(undefined)).toBe(0n);
  });
  it('утгагүй бичвэр → 0', () => expect(toMntAmount('nan')).toBe(0n));
});

describe('cleanCounterpart', () => {
  it('.0 арилгана', () => expect(cleanCounterpart('5303363476.0')).toBe('5303363476'));
  it('nan → хоосон', () => expect(cleanCounterpart('nan')).toBe(''));
  it('бичвэр хэвээр', () => expect(cleanCounterpart('ХХК данс')).toBe('ХХК данс'));
});

describe('parseFilename', () => {
  it('Хаанбанкны нэршил', () => expect(parseFilename('Statement_MNT_5301234567.xlsx')).toEqual({ currency: 'MNT', accountNumber: '5301234567' }));
  it('танигдахгүй нэр → өгөгдмөл', () => expect(parseFilename('huulga.xlsx')).toEqual({ currency: 'MNT', accountNumber: '' }));
});

describe('detectColumns', () => {
  it('гарчгаас индексийг олно (байрлал солигдсон ч)', () => {
    const rows: unknown[][] = [
      ['Хэвлэсэн: 2026-08-05'],
      ['Гүйлгээний огноо', 'Дансны үлдэгдэл', 'Кредит', 'Дебит', 'Гүйлгээний утга', 'Харьцсан данс'],
      ['2026-08-01', 0, 100, 0, 'тест', '123'],
    ];
    const c = detectColumns(rows);
    expect(c.headerRow).toBe(1);
    expect(c.credit).toBe(2);
    expect(c.debit).toBe(3);
    expect(c.desc).toBe(4);
    expect(c.counterpart).toBe(5);
  });
  it('гарчиг олдохгүй бол өгөгдмөл индекс', () => {
    expect(detectColumns([['a'], ['b']]).headerRow).toBe(1);
  });
});

describe('parseBankRows', () => {
  const rows: unknown[][] = [
    ['Хуулга 2026-08-01 2026-08-05'],
    ['Гүйлгээний огноо', 'x', 'y', 'Дебит', 'Кредит', 'z', 'Гүйлгээний утга', 'Харьцсан данс'],
    ['2026-08-01', '', '', 0, 500000, '', 'POS SETTLEMENT', '5301111111'],
    ['2026-08-02', '', '', 1200.4, 0, '', 'Гүйлгээний хураамж', ''],
    ['2026-08-03', '', '', 250000, 0, '', 'Түлш худалдан авалт', '5302222222.0'],
    ['тайлбар мөр', '', '', '', '', '', '', ''],
    ['Нийт дүн:', '', '', 251200, 500000, '', '', ''],
  ];

  it('зөвхөн жинхэнэ гүйлгээг авна (нийлбэр/тайлбар мөрийг алгасна)', () => {
    const { transactions } = parseBankRows(rows);
    expect(transactions).toHaveLength(3);
  });

  it('ПОС орлогыг таних', () => {
    const t = parseBankRows(rows).transactions[0]!;
    expect(t.creditMnt).toBe('500000');
    expect(t.debitMnt).toBe('0');
    expect(t.isSettlement).toBe(true);
    expect(t.txnDate).toBe('2026-08-01');
  });

  it('шимтгэлийг таних ба дүнг бүхэл болгох', () => {
    const t = parseBankRows(rows).transactions[1]!;
    expect(t.isFee).toBe(true);
    expect(t.debitMnt).toBe('1200'); // 1200.4 → 1200
  });

  it('харьцсан дансыг цэвэрлэнэ', () => {
    expect(parseBankRows(rows).transactions[2]!.bankCounterpart).toBe('5302222222');
  });

  it('хоосон хуулга', () => expect(parseBankRows([]).transactions).toHaveLength(0));
});

describe('sumBankTxns', () => {
  it('орлого/зарлагыг тусад нь нэгтгэнэ', () => {
    const { transactions } = parseBankRows([
      ['h'],
      ['Огноо', 'Дебит', 'Кредит', 'Утга'],
      ['2026-08-01', 0, 500000, 'a'],
      ['2026-08-02', 1200, 0, 'b'],
    ]);
    expect(sumBankTxns(transactions)).toEqual({ debitMnt: 1200n, creditMnt: 500000n });
  });
  it('хоосон', () => expect(sumBankTxns([])).toEqual({ debitMnt: 0n, creditMnt: 0n }));
});
