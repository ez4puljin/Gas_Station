import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { Providers } from './providers';
import { RegisterSW } from './register-sw';

export const metadata: Metadata = {
  title: 'Шатахуун станцын систем',
  description: 'Шатахуун түгээх станцын сүлжээний менежментийн систем',
  applicationName: 'Fuel Retail',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Fuel Retail' },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <RegisterSW />
      </body>
    </html>
  );
}
