import { describe, expect, it } from 'vitest';
import { computeWorkedMinutes, formatMinutesHm } from './attendance';

const H = (h: number) => h * 3_600_000;

describe('computeWorkedMinutes', () => {
  it('8 цаг, завсарлагагүй → 480', () => {
    expect(computeWorkedMinutes(0, H(8))).toBe(480);
  });

  it('8 цаг, 60 мин завсарлага → 420', () => {
    expect(computeWorkedMinutes(0, H(8), 60)).toBe(420);
  });

  it('90 минут → 90', () => {
    expect(computeWorkedMinutes(0, 90 * 60_000)).toBe(90);
  });

  it('гарах < орох → 0 (сөрөг болохгүй)', () => {
    expect(computeWorkedMinutes(H(8), 0)).toBe(0);
  });

  it('завсарлага нийт хугацаанаас их → 0', () => {
    expect(computeWorkedMinutes(0, H(1), 90)).toBe(0);
  });

  it('секунд бутархайг хамгийн ойрын минут болгож тоймлоно', () => {
    expect(computeWorkedMinutes(0, 29_000)).toBe(0); // 29с → 0м
    expect(computeWorkedMinutes(0, 31_000)).toBe(1); // 31с → 1м
    expect(computeWorkedMinutes(0, 90_000)).toBe(2); // 1.5м → 2м (round half up)
  });

  it('сөрөг завсарлагыг 0 болгож үзнэ', () => {
    expect(computeWorkedMinutes(0, H(2), -30)).toBe(120);
  });
});

describe('formatMinutesHm', () => {
  it('цаг+минут', () => expect(formatMinutesHm(420)).toBe('7ц'));
  it('цаг ба минут', () => expect(formatMinutesHm(425)).toBe('7ц 5м'));
  it('минут', () => expect(formatMinutesHm(45)).toBe('45м'));
  it('0', () => expect(formatMinutesHm(0)).toBe('0м'));
});
