-- Борлуулалтын дугаар салбар дотроо давхцахгүй байх (зэрэгцээ борлуулалт ижил дугаар авдаг байсан).
-- sale_number нь NULL байж болох тул хуучин NULL мөрүүд саад болохгүй (Postgres-д олон NULL зөвшөөрөгдөнө).
CREATE UNIQUE INDEX "sale_station_id_sale_number_key" ON "sale"("station_id", "sale_number");
