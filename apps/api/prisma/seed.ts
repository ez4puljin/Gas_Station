import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  FUEL_GRADE_LABEL,
  FuelGradeCode,
  ROLE_LABEL,
  RoleKey,
} from '@fuel/types';

const prisma = new PrismaClient();

/** RBAC permission-ийн суурь жагсаалт. */
const PERMISSIONS = [
  'pos.sell',
  'pos.void',
  'pos.refund',
  'inventory.view',
  'inventory.adjust',
  'staff.manage',
  'finance.view',
  'station.manage',
  'admin.all',
] as const;

/** Role бүрийн permission map. */
const ROLE_PERMISSIONS: Record<RoleKey, readonly string[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  STATION_MANAGER: [
    'pos.sell',
    'pos.void',
    'pos.refund',
    'inventory.view',
    'inventory.adjust',
    'staff.manage',
    'finance.view',
    'station.manage',
  ],
  ACCOUNTANT: ['finance.view', 'inventory.view'],
  SHIFT_SUPERVISOR: ['pos.sell', 'pos.void', 'pos.refund', 'inventory.view'],
  CASHIER: ['pos.sell'],
};

async function main(): Promise<void> {
  // 1) Түлшний грейд — §12 (АИ-80/92/95, ДТ)
  for (const code of Object.values(FuelGradeCode)) {
    await prisma.fuelGrade.upsert({
      where: { code },
      update: {},
      create: { code, name: FUEL_GRADE_LABEL[code] },
    });
  }

  // 2) Permission-ууд
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permRecords = await prisma.permission.findMany();
  const permByKey = new Map(permRecords.map((p) => [p.key, p.id]));

  // 3) Role-ууд + permission холбоос
  for (const key of Object.values(RoleKey)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: ROLE_LABEL[key] },
      create: { key, name: ROLE_LABEL[key], isSystem: true },
    });
    for (const permKey of ROLE_PERMISSIONS[key]) {
      const permissionId = permByKey.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // 4) Demo компани + салбар (тогтмол id → idempotent)
  const company = await prisma.company.upsert({
    where: { id: 'seed-company' },
    update: {},
    create: {
      id: 'seed-company',
      name: 'Демо Шатахуун ХХК',
      taxNumber: '0000000',
    },
  });

  const station = await prisma.station.upsert({
    where: { id: 'seed-station-1' },
    // Хуучин 'S001'-аас 'C1'-ийн формат руу шилжих (saleNumber-ийн загвартай нийцэх):
    // дахин seed хийхэд автоматаар шинэчлэгдэнэ. C1 — салбар №1, C2/C3 — нэмэх салбарууд.
    update: { code: 'C1' },
    create: {
      id: 'seed-station-1',
      companyId: company.id,
      code: 'C1',
      name: 'Төв салбар',
      address: 'Улаанбаатар',
    },
  });

  // 5) Демо резервуар + одоогийн үнэ (грейд бүрд)
  const grades = await prisma.fuelGrade.findMany();
  const demoPrices: Record<string, bigint> = {
    AI_80: 2390n,
    AI_92: 2690n,
    AI_95: 2990n,
    DIESEL: 3090n,
  };
  for (const grade of grades) {
    // fuel_tank-д `@@unique([stationId, code])` БАЙХГҮЙ (partial unique index-ээр сольсон,
    // CLAUDE.md §17.4) тул `upsert({ where: { stationId_code } })` ажиллахгүй → findFirst+create.
    const tankCode = `Tank-${grade.code}`;
    const existingTank = await prisma.fuelTank.findFirst({
      where: { stationId: station.id, code: tankCode, deletedAt: null },
      select: { id: true },
    });
    if (!existingTank) {
      await prisma.fuelTank.create({
        data: {
          stationId: station.id,
          fuelGradeId: grade.id,
          code: tankCode,
          capacityLiters: 20000,
          currentLiters: 12000,
          minLiters: 2000,
        },
      });
    }
    // Idempotent: идэвхтэй үнэ (effectiveTo=null) байхгүй үед л үүсгэнэ
    // (дахин seed хийхэд үнийн түүх давхардахаас сэргийлнэ)
    const currentPrice = await prisma.fuelPrice.findFirst({
      where: { stationId: station.id, fuelGradeId: grade.id, effectiveTo: null },
    });
    if (!currentPrice) {
      await prisma.fuelPrice.create({
        data: {
          stationId: station.id,
          fuelGradeId: grade.id,
          pricePerLiterMnt: demoPrices[grade.code] ?? 2500n,
          effectiveFrom: new Date(),
        },
      });
    }
  }

  // 5b) Бараа материал — бүлэг (ProductGroup), нийлүүлэгч, бараа (POS "Бараа материал" хэсэгт)
  const demoGroups = [
    { id: 'seed-group-maslo', name: 'Масло', sortOrder: 1 },
    { id: 'seed-group-tosol', name: 'Тосол', sortOrder: 2 },
  ];
  for (const g of demoGroups) {
    await prisma.productGroup.upsert({
      where: { id: g.id },
      update: {},
      create: { id: g.id, companyId: company.id, name: g.name, sortOrder: g.sortOrder },
    });
  }
  const demoSupplier = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-1' },
    update: {},
    create: { id: 'seed-supplier-1', companyId: company.id, name: 'Ойл Трейд ХХК', phone: '7700-0000' },
  });

  const demoProducts = [
    { id: 'seed-product-oil-10w40', sku: 'OIL-10W40-4L', name: 'Хөдөлгүүрийн тос 10W-40 (4л)', groupId: 'seed-group-maslo', category: 'Масло', unit: 'ш', priceMnt: 75000n, costMnt: 52000n },
    { id: 'seed-product-oil-5w30', sku: 'OIL-5W30-4L', name: 'Хөдөлгүүрийн тос 5W-30 (4л)', groupId: 'seed-group-maslo', category: 'Масло', unit: 'ш', priceMnt: 89000n, costMnt: 63000n },
    { id: 'seed-product-gear-oil', sku: 'OIL-GEAR-1L', name: 'Хурдны хайрцгийн тос (1л)', groupId: 'seed-group-maslo', category: 'Масло', unit: 'ш', priceMnt: 28000n, costMnt: 18000n },
    { id: 'seed-product-coolant', sku: 'COOL-TOSOL-5L', name: 'Тосол хөргөлтийн шингэн (5л)', groupId: 'seed-group-tosol', category: 'Тосол', unit: 'ш', priceMnt: 35000n, costMnt: 22000n },
    { id: 'seed-product-coolant-1l', sku: 'COOL-TOSOL-1L', name: 'Тосол хөргөлтийн шингэн (1л)', groupId: 'seed-group-tosol', category: 'Тосол', unit: 'ш', priceMnt: 9000n, costMnt: 5500n },
  ];
  for (const p of demoProducts) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { groupId: p.groupId, supplierId: demoSupplier.id },
      create: {
        id: p.id,
        companyId: company.id,
        groupId: p.groupId,
        supplierId: demoSupplier.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        priceMnt: p.priceMnt,
        costMnt: p.costMnt,
      },
    });
    await prisma.stockLevel.upsert({
      where: { stationId_productId: { stationId: station.id, productId: p.id } },
      update: {},
      create: { stationId: station.id, productId: p.id, quantity: 50, reorderLevel: 10 },
    });
  }

  // 6) Админ ажилтан + хэрэглэгч (owner)
  const employee = await prisma.employee.upsert({
    where: { id: 'seed-employee-admin' },
    update: {},
    create: {
      id: 'seed-employee-admin',
      companyId: company.id,
      firstName: 'Админ',
      lastName: 'Эзэмшигч',
      status: 'ACTIVE',
    },
  });

  // owner role (бүх салбар) + station хандалт
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: RoleKey.OWNER } });
  const existingOwner = await prisma.employeeRole.findFirst({
    where: { employeeId: employee.id, roleId: ownerRole.id, stationId: null },
  });
  if (!existingOwner) {
    await prisma.employeeRole.create({
      data: { employeeId: employee.id, roleId: ownerRole.id, stationId: null },
    });
  }
  await prisma.employeeStation.upsert({
    where: { employeeId_stationId: { employeeId: employee.id, stationId: station.id } },
    update: {},
    create: { employeeId: employee.id, stationId: station.id },
  });

  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await argon2.hash(password);
  await prisma.user.upsert({
    where: { id: 'seed-user-admin' },
    update: { passwordHash },
    create: {
      id: 'seed-user-admin',
      employeeId: employee.id,
      username: 'admin',
      passwordHash,
    },
  });

  console.log('✅ Seed дууслаа. Нэвтрэх: admin /', password);
}

main()
  .catch((err) => {
    console.error('Seed алдаа:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
