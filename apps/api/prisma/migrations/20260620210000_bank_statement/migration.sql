-- Банкны хуулга: файлын импорт + мөр тус бүрийг тааруулж GL-д бүртгэх.

-- CreateEnum
CREATE TYPE "BankMatchType" AS ENUM ('CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'GL_ENTRY', 'IGNORED');

-- CreateTable
CREATE TABLE "bank_statement" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MNT',
    "date_from" DATE,
    "date_to" DATE,
    "filename" TEXT NOT NULL DEFAULT '',
    "gl_account_code" TEXT NOT NULL DEFAULT '1110',
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "txn_date" DATE NOT NULL,
    "debit_mnt" BIGINT NOT NULL DEFAULT 0,
    "credit_mnt" BIGINT NOT NULL DEFAULT 0,
    "bank_description" TEXT NOT NULL DEFAULT '',
    "bank_counterpart" TEXT NOT NULL DEFAULT '',
    "is_fee" BOOLEAN NOT NULL DEFAULT false,
    "is_settlement" BOOLEAN NOT NULL DEFAULT false,
    "matchType" "BankMatchType",
    "description" TEXT NOT NULL DEFAULT '',
    "customer_id" TEXT,
    "supplier_id" TEXT,
    "account_code" TEXT,
    "journal_entry_id" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "posted_by_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statement_company_id_account_number_idx" ON "bank_statement"("company_id", "account_number");

-- CreateIndex
CREATE INDEX "bank_statement_company_id_date_from_idx" ON "bank_statement"("company_id", "date_from");

-- CreateIndex
CREATE INDEX "bank_transaction_statement_id_sort_order_idx" ON "bank_transaction"("statement_id", "sort_order");

-- CreateIndex
CREATE INDEX "bank_transaction_txn_date_idx" ON "bank_transaction"("txn_date");

-- AddForeignKey
ALTER TABLE "bank_statement" ADD CONSTRAINT "bank_statement_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — хуулга устгахад мөрүүд нь дагаж устана
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
