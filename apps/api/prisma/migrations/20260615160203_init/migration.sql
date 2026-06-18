-- CreateEnum
CREATE TYPE "FuelGradeCode" AS ENUM ('AI_80', 'AI_92', 'AI_95', 'DIESEL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'FUEL_CARD', 'MOBILE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'SALE', 'ADJUSTMENT', 'TRANSFER', 'LOSS');

-- CreateEnum
CREATE TYPE "SaleItemType" AS ENUM ('FUEL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FuelSaleMode" AS ENUM ('PREPAY', 'POSTPAY');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FuelDeliveryStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ReceiptCustomerType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration_no" TEXT,
    "tax_number" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "settings" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_grade" (
    "id" TEXT NOT NULL,
    "code" "FuelGradeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fuel_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_tank" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "fuel_grade_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity_liters" DECIMAL(14,3) NOT NULL,
    "current_liters" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_liters" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "fuel_tank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pump" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nozzle" (
    "id" TEXT NOT NULL,
    "pump_id" TEXT NOT NULL,
    "tank_id" TEXT NOT NULL,
    "fuel_grade_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "meter_reading" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "nozzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_reading" (
    "id" TEXT NOT NULL,
    "tank_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "level_liters" DECIMAL(14,3) NOT NULL,
    "temperature_c" DECIMAL(6,2),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tank_reading_pkey" PRIMARY KEY ("id","recorded_at")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ш',
    "barcode" TEXT,
    "price_mnt" BIGINT NOT NULL,
    "cost_mnt" BIGINT,
    "is_vatable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_level" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "product_id" TEXT,
    "fuel_tank_id" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost_mnt" BIGINT,
    "reason" TEXT,
    "actor_id" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "transfer_station_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "reg_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_delivery" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "fuel_grade_id" TEXT NOT NULL,
    "tank_id" TEXT,
    "status" "FuelDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "liters" DECIMAL(14,3) NOT NULL,
    "unit_cost_mnt" BIGINT NOT NULL,
    "total_cost_mnt" BIGINT NOT NULL,
    "document_no" TEXT,
    "received_by_id" TEXT,
    "received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "fuel_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_price" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "fuel_grade_id" TEXT NOT NULL,
    "price_per_liter_mnt" BIGINT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "sale_number" TEXT,
    "subtotal_mnt" BIGINT NOT NULL,
    "vat_mnt" BIGINT NOT NULL DEFAULT 0,
    "total_mnt" BIGINT NOT NULL,
    "customer_type" "ReceiptCustomerType",
    "customer_tin" TEXT,
    "ebarimt_id" TEXT,
    "ebarimt_qr" TEXT,
    "client_generated_id" TEXT NOT NULL,
    "sold_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "type" "SaleItemType" NOT NULL,
    "product_id" TEXT,
    "fuel_grade_id" TEXT,
    "nozzle_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price_mnt" BIGINT NOT NULL,
    "line_total_mnt" BIGINT NOT NULL,
    "vat_mnt" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "masked_pan" TEXT,
    "reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "amount_mnt" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "employee_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "hired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "employee_role" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "station_id" TEXT,

    CONSTRAINT "employee_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_station" (
    "employee_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,

    CONSTRAINT "employee_station_pkey" PRIMARY KEY ("employee_id","station_id")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opened_by_id" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "opening_cash_mnt" BIGINT NOT NULL DEFAULT 0,
    "closing_cash_mnt" BIGINT,
    "expected_cash_mnt" BIGINT,
    "note" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_cashier" (
    "shift_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,

    CONSTRAINT "shift_cashier_pkey" PRIMARY KEY ("shift_id","employee_id")
);

-- CreateTable
CREATE TABLE "shift_meter_reading" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "nozzle_id" TEXT NOT NULL,
    "opening_meter" DECIMAL(14,3) NOT NULL,
    "closing_meter" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_meter_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_reconciliation" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "expected_cash_mnt" BIGINT NOT NULL,
    "counted_cash_mnt" BIGINT NOT NULL,
    "variance_mnt" BIGINT NOT NULL,
    "note" TEXT,
    "reconciled_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "clock_in" TIMESTAMPTZ(6) NOT NULL,
    "clock_out" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "station_id" TEXT,
    "ip" TEXT,
    "correlation_id" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue_item" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "client_generated_id" TEXT NOT NULL,
    "device_id" TEXT,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "conflict" JSONB,
    "client_created_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_queue_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "station_company_id_idx" ON "station"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "station_company_id_code_key" ON "station"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_grade_code_key" ON "fuel_grade"("code");

-- CreateIndex
CREATE INDEX "fuel_tank_station_id_idx" ON "fuel_tank"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_tank_station_id_code_key" ON "fuel_tank"("station_id", "code");

-- CreateIndex
CREATE INDEX "pump_station_id_idx" ON "pump"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "pump_station_id_code_key" ON "pump"("station_id", "code");

-- CreateIndex
CREATE INDEX "nozzle_pump_id_idx" ON "nozzle"("pump_id");

-- CreateIndex
CREATE INDEX "nozzle_tank_id_idx" ON "nozzle"("tank_id");

-- CreateIndex
CREATE INDEX "tank_reading_tank_id_recorded_at_idx" ON "tank_reading"("tank_id", "recorded_at");

-- CreateIndex
CREATE INDEX "tank_reading_station_id_recorded_at_idx" ON "tank_reading"("station_id", "recorded_at");

-- CreateIndex
CREATE INDEX "product_company_id_idx" ON "product"("company_id");

-- CreateIndex
CREATE INDEX "product_barcode_idx" ON "product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_company_id_sku_key" ON "product"("company_id", "sku");

-- CreateIndex
CREATE INDEX "stock_level_station_id_idx" ON "stock_level"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_level_station_id_product_id_key" ON "stock_level"("station_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movement_station_id_created_at_idx" ON "stock_movement"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movement_product_id_idx" ON "stock_movement"("product_id");

-- CreateIndex
CREATE INDEX "stock_movement_type_idx" ON "stock_movement"("type");

-- CreateIndex
CREATE INDEX "supplier_company_id_idx" ON "supplier"("company_id");

-- CreateIndex
CREATE INDEX "fuel_delivery_station_id_created_at_idx" ON "fuel_delivery"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "fuel_price_station_id_fuel_grade_id_effective_from_idx" ON "fuel_price"("station_id", "fuel_grade_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "sale_client_generated_id_key" ON "sale"("client_generated_id");

-- CreateIndex
CREATE INDEX "sale_station_id_sold_at_idx" ON "sale"("station_id", "sold_at");

-- CreateIndex
CREATE INDEX "sale_shift_id_idx" ON "sale"("shift_id");

-- CreateIndex
CREATE INDEX "sale_cashier_id_idx" ON "sale"("cashier_id");

-- CreateIndex
CREATE INDEX "sale_line_sale_id_idx" ON "sale_line"("sale_id");

-- CreateIndex
CREATE INDEX "payment_sale_id_idx" ON "payment"("sale_id");

-- CreateIndex
CREATE INDEX "refund_sale_id_idx" ON "refund"("sale_id");

-- CreateIndex
CREATE INDEX "refund_station_id_created_at_idx" ON "refund"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_company_id_idx" ON "employee"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "employee_role_employee_id_idx" ON "employee_role"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_role_employee_id_role_id_station_id_key" ON "employee_role"("employee_id", "role_id", "station_id");

-- CreateIndex
CREATE INDEX "shift_station_id_opened_at_idx" ON "shift"("station_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "shift_meter_reading_shift_id_nozzle_id_key" ON "shift_meter_reading"("shift_id", "nozzle_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_reconciliation_shift_id_key" ON "cash_reconciliation"("shift_id");

-- CreateIndex
CREATE INDEX "cash_reconciliation_station_id_created_at_idx" ON "cash_reconciliation"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_employee_id_idx" ON "attendance"("employee_id");

-- CreateIndex
CREATE INDEX "attendance_station_id_clock_in_idx" ON "attendance"("station_id", "clock_in");

-- CreateIndex
CREATE UNIQUE INDEX "user_employee_id_key" ON "user"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_station_id_at_idx" ON "audit_log"("station_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_at_idx" ON "audit_log"("actor_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_queue_item_client_generated_id_key" ON "sync_queue_item"("client_generated_id");

-- CreateIndex
CREATE INDEX "sync_queue_item_station_id_status_idx" ON "sync_queue_item"("station_id", "status");

-- CreateIndex
CREATE INDEX "sync_queue_item_status_idx" ON "sync_queue_item"("status");

-- AddForeignKey
ALTER TABLE "station" ADD CONSTRAINT "station_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank" ADD CONSTRAINT "fuel_tank_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank" ADD CONSTRAINT "fuel_tank_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump" ADD CONSTRAINT "pump_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle" ADD CONSTRAINT "nozzle_pump_id_fkey" FOREIGN KEY ("pump_id") REFERENCES "pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle" ADD CONSTRAINT "nozzle_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle" ADD CONSTRAINT "nozzle_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_reading" ADD CONSTRAINT "tank_reading_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_reading" ADD CONSTRAINT "tank_reading_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_delivery" ADD CONSTRAINT "fuel_delivery_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_price" ADD CONSTRAINT "fuel_price_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_price" ADD CONSTRAINT "fuel_price_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_fuel_grade_id_fkey" FOREIGN KEY ("fuel_grade_id") REFERENCES "fuel_grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_nozzle_id_fkey" FOREIGN KEY ("nozzle_id") REFERENCES "nozzle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_station" ADD CONSTRAINT "employee_station_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_station" ADD CONSTRAINT "employee_station_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_cashier" ADD CONSTRAINT "shift_cashier_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_cashier" ADD CONSTRAINT "shift_cashier_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_meter_reading" ADD CONSTRAINT "shift_meter_reading_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_meter_reading" ADD CONSTRAINT "shift_meter_reading_nozzle_id_fkey" FOREIGN KEY ("nozzle_id") REFERENCES "nozzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliation" ADD CONSTRAINT "cash_reconciliation_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliation" ADD CONSTRAINT "cash_reconciliation_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue_item" ADD CONSTRAINT "sync_queue_item_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
