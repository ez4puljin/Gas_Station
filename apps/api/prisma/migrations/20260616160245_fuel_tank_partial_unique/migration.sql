-- DropIndex
DROP INDEX "fuel_tank_station_id_code_key";

-- CreateIndex
CREATE INDEX "fuel_tank_station_id_code_idx" ON "fuel_tank"("station_id", "code");

-- Partial unique: идэвхтэй (устгаагүй) савны код л давхцахгүй (soft-delete-тэй код дахин ашиглагдана §2.6)
CREATE UNIQUE INDEX "fuel_tank_station_code_active_key" ON "fuel_tank"("station_id", "code") WHERE "deleted_at" IS NULL;
