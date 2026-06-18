-- (enum утгууд өмнөх migration-д нэмэгдсэн: TRANSFER, PENDING_OPEN, PENDING_CLOSE)

-- AlterTable
ALTER TABLE "shift" ADD COLUMN     "close_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "close_requested_by_id" TEXT,
ADD COLUMN     "open_approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "open_approved_by_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_OPEN';

-- CreateTable
CREATE TABLE "shift_tank_reading" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "fuel_tank_id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "centimeters" DECIMAL(8,2) NOT NULL,
    "liters" DECIMAL(14,3),
    "image_url" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_tank_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_tender" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "declared_mnt" BIGINT NOT NULL,
    "expected_mnt" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_tender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_tank_reading_shift_id_idx" ON "shift_tank_reading"("shift_id");

-- CreateIndex
CREATE INDEX "shift_tender_shift_id_idx" ON "shift_tender"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_tender_shift_id_method_key" ON "shift_tender"("shift_id", "method");

-- CreateIndex
CREATE INDEX "shift_status_idx" ON "shift"("status");

-- AddForeignKey
ALTER TABLE "shift_tank_reading" ADD CONSTRAINT "shift_tank_reading_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tank_reading" ADD CONSTRAINT "shift_tank_reading_fuel_tank_id_fkey" FOREIGN KEY ("fuel_tank_id") REFERENCES "fuel_tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tender" ADD CONSTRAINT "shift_tender_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Нэг салбарт нэг л ИДЭВХТЭЙ (хаагдаагүй) ээлж — takeover хаалт DB түвшинд (§7.3).
-- Хуучин зөвхөн OPEN-ийг хязгаарладаг байсныг PENDING_OPEN/OPEN/PENDING_CLOSE бүгдэд өргөтгөнө.
DROP INDEX IF EXISTS "shift_one_open_per_station";
CREATE UNIQUE INDEX "shift_one_active_per_station" ON "shift" ("station_id") WHERE status <> 'CLOSED';
