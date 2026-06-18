'use client';

import { useEffect } from 'react';

/** Service Worker бүртгэл — PWA shell (CLAUDE.md §9). Бүрэн offline дараалал дараагийн фазад. */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // dev-д SW унтраалттай
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW бүртгэл амжилтгүй — чимээгүй өнгөрүүлнэ */
      });
    };
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
