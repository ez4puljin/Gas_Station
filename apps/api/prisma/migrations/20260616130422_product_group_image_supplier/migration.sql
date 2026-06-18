-- AlterTable
ALTER TABLE "product" ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "supplier_id" TEXT;

-- CreateTable
CREATE TABLE "product_group" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_group_company_id_idx" ON "product_group"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_group_company_id_name_key" ON "product_group"("company_id", "name");

-- CreateIndex
CREATE INDEX "product_group_id_idx" ON "product"("group_id");

-- CreateIndex
CREATE INDEX "product_supplier_id_idx" ON "product"("supplier_id");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_group" ADD CONSTRAINT "product_group_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
