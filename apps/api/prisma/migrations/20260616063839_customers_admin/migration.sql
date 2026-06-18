-- CreateEnum
CREATE TYPE "CustomerTxnType" AS ENUM ('CREDIT_SALE', 'PAYMENT', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT';

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "customer_id" TEXT;

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "reg_no" TEXT,
    "address" TEXT,
    "credit_limit_mnt" BIGINT NOT NULL DEFAULT 0,
    "balance_mnt" BIGINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_transaction" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "station_id" TEXT,
    "type" "CustomerTxnType" NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "balance_after_mnt" BIGINT NOT NULL,
    "sale_id" TEXT,
    "method" "PaymentMethod",
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_company_id_idx" ON "customer"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_company_id_code_key" ON "customer"("company_id", "code");

-- CreateIndex
CREATE INDEX "customer_transaction_customer_id_created_at_idx" ON "customer_transaction"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_transaction_station_id_created_at_idx" ON "customer_transaction"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_customer_id_idx" ON "sale"("customer_id");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_transaction" ADD CONSTRAINT "customer_transaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_transaction" ADD CONSTRAINT "customer_transaction_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;
