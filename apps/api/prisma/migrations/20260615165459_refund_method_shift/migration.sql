-- AlterTable
ALTER TABLE "refund" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "shift_id" TEXT;

-- CreateIndex
CREATE INDEX "refund_shift_id_idx" ON "refund"("shift_id");

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
