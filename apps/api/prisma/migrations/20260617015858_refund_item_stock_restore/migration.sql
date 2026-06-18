-- CreateTable
CREATE TABLE "refund_item" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "sale_line_id" TEXT NOT NULL,
    "type" "SaleItemType" NOT NULL,
    "product_id" TEXT,
    "fuel_tank_id" TEXT,
    "fuel_grade_id" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "vat_mnt" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_item_refund_id_idx" ON "refund_item"("refund_id");

-- CreateIndex
CREATE INDEX "refund_item_sale_line_id_idx" ON "refund_item"("sale_line_id");

-- AddForeignKey
ALTER TABLE "refund_item" ADD CONSTRAINT "refund_item_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_item" ADD CONSTRAINT "refund_item_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
