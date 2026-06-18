-- Шинэ enum утгуудыг ТУСАД нь нэмнэ — PostgreSQL дээр шинэ enum утгыг нэмсэн
-- transaction дотроо ашиглах боломжгүй (дараагийн migration-д SET DEFAULT/ашиглалт).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "ShiftStatus" ADD VALUE IF NOT EXISTS 'PENDING_OPEN';
ALTER TYPE "ShiftStatus" ADD VALUE IF NOT EXISTS 'PENDING_CLOSE';
