import { AccountType } from '@fuel/types';

/**
 * Монгол стандартад дөхсөн, шатахуун станцад тохирсон ӨГӨГДМӨЛ дансны төлөвлөгөө.
 * Бүлэг данс (isPostable=false) дор навч данс (бичилт хийх). Шинэ компанид нэг удаа seed-лнэ.
 * Кодууд `@fuel/types` STD_ACCOUNT-тэй тохирно (авто-бичилтэд).
 */
export interface CoaSeed {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isPostable?: boolean; // default true; бүлэг данс false
}

export const DEFAULT_CHART_OF_ACCOUNTS: CoaSeed[] = [
  // ── Хөрөнгө ──
  { code: '1000', name: 'Хөрөнгө', type: AccountType.ASSET, isPostable: false },
  { code: '1100', name: 'Касс', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1110', name: 'Харилцах данс (банк)', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1120', name: 'Бэлэн мөнгө — сейф', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1200', name: 'Худалдааны авлага', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1210', name: 'Бусад авлага', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1300', name: 'Бараа материал', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1310', name: 'Түлшний нөөц', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1400', name: 'Урьдчилж төлсөн зардал', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1500', name: 'Үндсэн хөрөнгө', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1510', name: 'Хуримтлагдсан элэгдэл', type: AccountType.ASSET, parentCode: '1000' },

  // ── Өр төлбөр ──
  { code: '3000', name: 'Өр төлбөр', type: AccountType.LIABILITY, isPostable: false },
  { code: '3100', name: 'Худалдааны өглөг', type: AccountType.LIABILITY, parentCode: '3000' },
  { code: '3200', name: 'НӨАТ-ын өглөг', type: AccountType.LIABILITY, parentCode: '3000' },
  { code: '3300', name: 'Цалингийн өглөг', type: AccountType.LIABILITY, parentCode: '3000' },
  { code: '3310', name: 'НДШ/ХХОАТ-ын өглөг', type: AccountType.LIABILITY, parentCode: '3000' },
  { code: '3400', name: 'Бусад богино хугацаат өр', type: AccountType.LIABILITY, parentCode: '3000' },

  // ── Өмч ──
  { code: '4000', name: 'Өмч', type: AccountType.EQUITY, isPostable: false },
  { code: '4100', name: 'Эзэмшигчийн өмч', type: AccountType.EQUITY, parentCode: '4000' },
  { code: '4200', name: 'Хуримтлагдсан ашиг', type: AccountType.EQUITY, parentCode: '4000' },

  // ── Орлого ──
  { code: '5000', name: 'Орлого', type: AccountType.REVENUE, isPostable: false },
  { code: '5100', name: 'Түлшний борлуулалт', type: AccountType.REVENUE, parentCode: '5000' },
  { code: '5200', name: 'Барааны борлуулалт', type: AccountType.REVENUE, parentCode: '5000' },
  { code: '5900', name: 'Бусад орлого', type: AccountType.REVENUE, parentCode: '5000' },

  // ── Борлуулалтын өртөг ──
  { code: '6000', name: 'Борлуулалтын өртөг', type: AccountType.EXPENSE, isPostable: false },
  { code: '6100', name: 'Борлуулсан түлшний өртөг', type: AccountType.EXPENSE, parentCode: '6000' },
  { code: '6200', name: 'Борлуулсан барааны өртөг', type: AccountType.EXPENSE, parentCode: '6000' },

  // ── Үйл ажиллагааны зардал ──
  { code: '7000', name: 'Үйл ажиллагааны зардал', type: AccountType.EXPENSE, isPostable: false },
  { code: '7100', name: 'Цалин зардал', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7110', name: 'НДШ зардал (ажил олгогч)', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7200', name: 'Түлш / эрчим хүч', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7300', name: 'Түрээс', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7400', name: 'Элэгдэл', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7500', name: 'Бусад зардал', type: AccountType.EXPENSE, parentCode: '7000' },
  { code: '7900', name: 'Хорогдол / алдагдал', type: AccountType.EXPENSE, parentCode: '7000' },
];
