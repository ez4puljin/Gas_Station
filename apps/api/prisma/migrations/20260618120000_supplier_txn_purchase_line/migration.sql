-- Нийлүүлэгчийн RECEIPT гүйлгээг яг тухайн худалдан авалтын мөртэй холбоно
-- (тайлангийн гүйлгээ дээр double-click хийхэд орсон бараа/түлшийг тодорхой харуулах).

-- AlterTable
ALTER TABLE "supplier_transaction" ADD COLUMN     "purchase_line_id" TEXT;

-- AddForeignKey
ALTER TABLE "supplier_transaction" ADD CONSTRAINT "supplier_transaction_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;
