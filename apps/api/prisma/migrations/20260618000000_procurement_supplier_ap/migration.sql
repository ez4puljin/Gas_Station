-- Худалдан авалт (procurement) + нийлүүлэгчийн өглөг (AP) — CLAUDE.md §9
-- Нийлүүлэгчээс түлш/бараа худалдан авч олон салбар/сав руу хуваарилна; PENDING→RECEIVED.
-- Шинэ enum-ууд нь CREATE TYPE (ADD VALUE биш) тул нэг transaction дотор аюулгүй.

-- CreateEnum
CREATE TYPE "SupplierTxnType" AS ENUM ('RECEIPT', 'PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PurchaseLineStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- AlterTable (нийлүүлэгчийн өглөгийн running үлдэгдэл — integer MNT)
ALTER TABLE "supplier" ADD COLUMN     "balance_mnt" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_no" TEXT,
    "document_no" TEXT,
    "note" TEXT,
    "total_cost_mnt" BIGINT NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "item_type" "SaleItemType" NOT NULL,
    "status" "PurchaseLineStatus" NOT NULL DEFAULT 'PENDING',
    "fuel_grade_id" TEXT,
    "tank_id" TEXT,
    "product_id" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost_mnt" BIGINT NOT NULL,
    "total_cost_mnt" BIGINT NOT NULL,
    "received_by_id" TEXT,
    "received_at" TIMESTAMPTZ(6),
    "fuel_delivery_id" TEXT,
    "stock_movement_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_transaction" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "type" "SupplierTxnType" NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "balance_after_mnt" BIGINT NOT NULL,
    "purchase_id" TEXT,
    "method" "PaymentMethod",
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_company_id_created_at_idx" ON "purchase"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_supplier_id_idx" ON "purchase"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_line_purchase_id_idx" ON "purchase_line"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_line_station_id_status_idx" ON "purchase_line"("station_id", "status");

-- CreateIndex
CREATE INDEX "supplier_transaction_supplier_id_created_at_idx" ON "supplier_transaction"("supplier_id", "created_at");

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_transaction" ADD CONSTRAINT "supplier_transaction_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
