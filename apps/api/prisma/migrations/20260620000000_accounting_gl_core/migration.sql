-- Нягтлан бодох бүртгэл: дансны төлөвлөгөө (Account) + давхар бичилтийн журнал (JournalEntry/JournalLine).
-- Шинэ enum-ууд CREATE TYPE тул нэг transaction дотор аюулгүй (ADD VALUE биш).

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('SALE', 'PURCHASE', 'SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT', 'CASH', 'PAYROLL', 'EOD', 'OPENING', 'MANUAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "normal_side" "NormalSide" NOT NULL,
    "parent_id" TEXT,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "station_id" TEXT,
    "entry_no" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "source" "JournalSource" NOT NULL DEFAULT 'MANUAL',
    "memo" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT true,
    "reversed_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "station_id" TEXT,
    "debit_mnt" BIGINT NOT NULL DEFAULT 0,
    "credit_mnt" BIGINT NOT NULL DEFAULT 0,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_company_id_type_idx" ON "account"("company_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "account_company_id_code_key" ON "account"("company_id", "code");

-- CreateIndex
CREATE INDEX "journal_entry_company_id_date_idx" ON "journal_entry"("company_id", "date");

-- CreateIndex
CREATE INDEX "journal_entry_ref_type_ref_id_idx" ON "journal_entry"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_company_id_entry_no_key" ON "journal_entry"("company_id", "entry_no");

-- CreateIndex
CREATE INDEX "journal_line_entry_id_idx" ON "journal_line"("entry_id");

-- CreateIndex
CREATE INDEX "journal_line_account_id_idx" ON "journal_line"("account_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

