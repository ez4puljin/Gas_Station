-- Өдрийн хаалт (EOD) — салбарын өдрийн борлуулалтыг GL-д нэгтгэн бичсэн бүртгэл.

-- CreateTable
CREATE TABLE "daily_close" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "sales_gross_mnt" BIGINT NOT NULL,
    "sales_net_mnt" BIGINT NOT NULL,
    "vat_mnt" BIGINT NOT NULL,
    "journal_entry_id" TEXT,
    "closed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_close_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_close_station_id_business_date_idx" ON "daily_close"("station_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_close_station_id_business_date_key" ON "daily_close"("station_id", "business_date");

-- AddForeignKey
ALTER TABLE "daily_close" ADD CONSTRAINT "daily_close_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

