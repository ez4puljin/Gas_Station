-- Цаг бүртгэл (attendance) дэлгэрүүлэлт: завсарлага/ажилласан минут/тэмдэглэл/бүртгэгч + soft-delete.

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "break_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance" ADD COLUMN     "worked_minutes" INTEGER;
ALTER TABLE "attendance" ADD COLUMN     "note" TEXT;
ALTER TABLE "attendance" ADD COLUMN     "recorded_by_id" TEXT;
ALTER TABLE "attendance" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);
-- updated_at: Prisma @updatedAt (DB default-гүй). Хоосон/дүүрэн аль ч хүснэгтэд найдвартай: түр default → drop.
ALTER TABLE "attendance" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "attendance" ALTER COLUMN  "updated_at" DROP DEFAULT;

-- Нэг ажилтанд нэг л НЭЭЛТТЭЙ (гараагүй, устгаагүй) бичлэг — давхар clock-in хориглоно (§12 partial unique).
CREATE UNIQUE INDEX "attendance_open_per_employee_key" ON "attendance"("employee_id") WHERE "clock_out" IS NULL AND "deleted_at" IS NULL;
