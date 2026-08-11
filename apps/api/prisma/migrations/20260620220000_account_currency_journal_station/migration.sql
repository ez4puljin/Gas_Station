-- Дансны төлөвлөгөөг өргөтгөх: валют, журналын бүлэг, салбарын харьяалал.

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'MNT';
ALTER TABLE "account" ADD COLUMN     "journal_name" TEXT;
ALTER TABLE "account" ADD COLUMN     "station_id" TEXT;

-- CreateIndex — салбараар шүүх
CREATE INDEX "account_station_id_idx" ON "account"("station_id");

-- AddForeignKey — салбар устгагдвал данс нь нийт байгууллагынх болно
ALTER TABLE "account" ADD CONSTRAINT "account_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;
