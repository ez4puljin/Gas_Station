'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * children-ийг `document.body`-д portal-аар зурна.
 *
 * Учир: хуудасны `<main>` нь `animation: fadeUp … both` (globals.css)-тэй бөгөөд transform-той
 * keyframe + fill `both` нь Chromium-д **containing block** үүсгэдэг. Тиймээс модалын
 * `position: fixed; inset: 0` нь бүтэн дэлгэцэд биш, `<main>`-ийн (хажуугийн цэсээс хойших)
 * хайрцагт хязгаарлагдаж, голд төвлөрөхгүй + зөвхөн хагас blur болдог. body-д portal хийснээр
 * аливаа эцэг containing block-оос мултарч бүтэн viewport-д гарна.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
