'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * НЭГТГЭСЭН: энэ тайлан `/reports/receivables` рүү шилжсэн.
 * (Хоёр тайлан ижил өгөгдлийг давхардуулан харуулж байсныг нэг болгов —
 *  хуучин холбоос эвдрэхээс сэргийлж чиглүүлнэ.)
 */
export default function MovedPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/reports/receivables'); }, [router]);
  return <main className="grid min-h-screen place-items-center text-muted-foreground">Шилжүүлж байна…</main>;
}
