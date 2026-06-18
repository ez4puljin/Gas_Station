import type { ComponentType, ReactNode } from 'react';

/**
 * Модулийн хуудасны нэгдсэн толгой — градиент icon хайрцаг + гарчиг + тайлбар + үйлдэл.
 * Дээд мөрөнд (AppShell) гарчиг давхар харагдах нь зориуд (контекст + хуудасны гол гарчиг).
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
