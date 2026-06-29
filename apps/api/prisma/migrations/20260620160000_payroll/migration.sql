-- Цалин: Employee.baseSalaryMnt + PayrollRun/PayrollItem + PayrollStatus.

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "base_salary_mnt" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'POSTED',
    "gross_mnt" BIGINT NOT NULL,
    "employee_ndsh_mnt" BIGINT NOT NULL,
    "pit_mnt" BIGINT NOT NULL,
    "employer_ndsh_mnt" BIGINT NOT NULL,
    "net_mnt" BIGINT NOT NULL,
    "journal_entry_id" TEXT,
    "run_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_item" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_salary_mnt" BIGINT NOT NULL,
    "bonus_mnt" BIGINT NOT NULL DEFAULT 0,
    "gross_mnt" BIGINT NOT NULL,
    "employee_ndsh_mnt" BIGINT NOT NULL,
    "pit_mnt" BIGINT NOT NULL,
    "employer_ndsh_mnt" BIGINT NOT NULL,
    "net_mnt" BIGINT NOT NULL,

    CONSTRAINT "payroll_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_run_company_id_period_idx" ON "payroll_run"("company_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_company_id_period_key" ON "payroll_run"("company_id", "period");

-- CreateIndex
CREATE INDEX "payroll_item_payroll_run_id_idx" ON "payroll_item"("payroll_run_id");

-- CreateIndex
CREATE INDEX "payroll_item_employee_id_idx" ON "payroll_item"("employee_id");

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

