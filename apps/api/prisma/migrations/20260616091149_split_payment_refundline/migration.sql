-- CreateTable
CREATE TABLE "refund_line" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_line_refund_id_idx" ON "refund_line"("refund_id");

-- CreateIndex
CREATE INDEX "refund_line_method_idx" ON "refund_line"("method");

-- AddForeignKey
ALTER TABLE "refund_line" ADD CONSTRAINT "refund_line_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: одоо байгаа буцаалт бүрд хуучин refund.method-аас нэг RefundLine үүсгэнэ
-- (refund.method-ийг УСТГАХААС ӨМНӨ — түүхэн бэлэн буцаалт reconciliation-аас алга болохгүй).
INSERT INTO "refund_line" ("id", "refund_id", "method", "amount_mnt", "created_at")
SELECT gen_random_uuid(), "id", "method", "amount_mnt", "created_at" FROM "refund";

-- AlterTable (backfill хийсний дараа method баганыг устгана)
ALTER TABLE "refund" DROP COLUMN "method";
