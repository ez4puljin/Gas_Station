import { describe, expect, it } from 'vitest';
import { addVat, formatMnt, parseMnt, splitVatFromGross, toMnt } from './money';

describe('toMnt', () => {
  it('бүхэл number-ийг bigint болгоно', () => {
    expect(toMnt(1500)).toBe(1500n);
  });

  it('таслал/тэмдэгттэй string-ийг цэвэрлэнэ', () => {
    expect(toMnt('1,500 ₮')).toBe(1500n);
    expect(toMnt('  2500  ')).toBe(2500n);
  });

  it('бутархай number-ийг татгалзана (float ашиглахгүй §2.1)', () => {
    expect(() => toMnt(1500.5)).toThrow();
  });

  it('буруу string-ийг татгалзана', () => {
    expect(() => parseMnt('abc')).toThrow();
  });

  it('regression: 2^53-аас дээш аюулгүй бус number-ийг татгалзана (нарийвчлал)', () => {
    expect(() => toMnt(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });

  it('том дүнг string-ээр алдалгүй хүлээж авна', () => {
    expect(toMnt('9007199254740993')).toBe(9007199254740993n);
  });
});

describe('formatMnt', () => {
  it('мянгатын тусгаарлагч + ₮ тэмдэг', () => {
    expect(formatMnt(1500)).toBe('1,500 ₮');
    expect(formatMnt(1234567)).toBe('1,234,567 ₮');
    expect(formatMnt(0)).toBe('0 ₮');
  });

  it('сөрөг дүн', () => {
    expect(formatMnt(-1500)).toBe('-1,500 ₮');
  });

  it('symbol-гүй', () => {
    expect(formatMnt(1500, { symbol: false })).toBe('1,500');
  });
});

describe('НӨАТ (10%)', () => {
  it('gross-оос ялгана: 110 -> net 100, vat 10', () => {
    const { net, vat } = splitVatFromGross(110);
    expect(net).toBe(100n);
    expect(vat).toBe(10n);
  });

  it('net дээр нэмнэ: 1000 -> vat 100, gross 1100', () => {
    const { gross, vat } = addVat(1000);
    expect(vat).toBe(100n);
    expect(gross).toBe(1100n);
  });

  it('round-trip: addVat дараа splitVatFromGross', () => {
    const { gross } = addVat(2500);
    const { net } = splitVatFromGross(gross);
    expect(net).toBe(2500n);
  });
});
