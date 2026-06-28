-- Бэлэн мөнгөний менежмент (касс→сейф→банк) — CashMovement + CashMovementType.

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('DROP', 'DEPOSIT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "cash_movement" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "shift_id" TEXT,
    "journal_entry_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_movement_station_id_created_at_idx" ON "cash_movement"("station_id", "created_at");

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

