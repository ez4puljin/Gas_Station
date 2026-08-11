-- JournalSource-д BANK нэмэх.
-- §12: enum-д ADD VALUE хийх ба түүнийг АШИГЛАХ нь ТУСДАА migration байх ёстой
-- (нэг transaction дотор шинэ утгыг ашиглаж болохгүй). Энд зөвхөн нэмнэ.
ALTER TYPE "JournalSource" ADD VALUE IF NOT EXISTS 'BANK';
