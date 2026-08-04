-- Кассын хариуцлага: ээлжийн зөрүүг ажилтанд холбох хэрэг + цалингийн суутгал.

-- CreateEnum
CREATE TYPE "CashCaseStatus" AS ENUM ('OPEN', 'PENDING_DEDUCTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CashCaseResolution" AS ENUM ('RECOVERED_CASH', 'DEDUCT_SALARY', 'WRITE_OFF', 'OVERAGE_INCOME');

-- AlterTable — цалингийн суутгал (гарт олгох = ... − суутгал)
ALTER TABLE "payroll_run" ADD COLUMN     "deduction_mnt" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "payroll_item" ADD COLUMN    "deduction_mnt" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cash_variance_case" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "variance_mnt" BIGINT NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "status" "CashCaseStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "CashCaseResolution",
    "recovered_mnt" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "open_journal_entry_id" TEXT,
    "resolve_journal_entry_id" TEXT,
    "payroll_run_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_variance_case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — нэг ээлжид нэг хэрэг (давхар үүсэхээс сэргийлнэ)
CREATE UNIQUE INDEX "cash_variance_case_shift_id_key" ON "cash_variance_case"("shift_id");

-- CreateIndex
CREATE INDEX "cash_variance_case_company_id_status_idx" ON "cash_variance_case"("company_id", "status");

-- CreateIndex
CREATE INDEX "cash_variance_case_employee_id_created_at_idx" ON "cash_variance_case"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_variance_case_station_id_created_at_idx" ON "cash_variance_case"("station_id", "created_at");

-- AddForeignKey
ALTER TABLE "cash_variance_case" ADD CONSTRAINT "cash_variance_case_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_variance_case" ADD CONSTRAINT "cash_variance_case_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_variance_case" ADD CONSTRAINT "cash_variance_case_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_variance_case" ADD CONSTRAINT "cash_variance_case_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
