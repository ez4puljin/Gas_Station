-- Нэг салбарт зэрэг ЗӨВХӨН нэг нээлттэй ээлж — §7.3 (race-аас сэргийлэх DB баталгаа).
-- Аппын findFirst шалгалт TOCTOU цонхтой тул DB түвшинд partial unique index шаардлагатай.
CREATE UNIQUE INDEX IF NOT EXISTS shift_one_open_per_station
  ON "shift" ("station_id")
  WHERE status = 'OPEN';
