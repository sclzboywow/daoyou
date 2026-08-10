import Link from '@app/components/router/AppLink';
import { cn } from '@shared/lib/cn';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { adminNavItems } from '../_config/nav';

interface AdminShellProps {
  adminEmail: string;
  adminUserId: string;
  children: ReactNode;
}

export function AdminShell({
  adminEmail,
  adminUserId,
  children,
}: AdminShellProps) {
  const { pathname, search } = useLocation();
  const currentLocation = `${pathname}${search}`;
  const isNavItemActive = (href: string) => {
    if (href.includes('?')) return currentLocation === href;
    if (href === '/admin') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="bg-paper relative min-h-screen overflow-hidden">
      <div className="app-safe-area-page relative mx-auto flex w-full max-w-7xl flex-col gap-6 [--app-safe-area-block-space:1.5rem] lg:flex-row lg:[--app-safe-area-inline-space:2rem]">
        <aside className="border-ink/15 bg-bgpaper/90 w-full shrink-0 border border-dashed p-4 lg:sticky lg:top-[calc(env(safe-area-inset-top)+1.5rem)] lg:w-72 lg:self-start">
          <div className="border-ink/10 mb-4 border-b pb-4">
            <p className="text-ink-secondary text-xs tracking-[0.2em]">
              OPS CONSOLE
            </p>
            <h1 className="font-heading text-ink mt-2 text-3xl">万界司天台</h1>
            <p className="text-ink-secondary mt-2 text-sm">{adminEmail}</p>
            <p className="text-ink-secondary/75 mt-1 font-mono text-[11px] break-all">
              ID: {adminUserId}
            </p>
          </div>

          <nav className="space-y-2">
            {adminNavItems.map((item) => {
              const active = isNavItemActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block border px-3 py-2 no-underline transition-colors',
                    active
                      ? 'border-crimson/60 bg-crimson/8 text-ink'
                      : 'text-ink-secondary hover:border-ink/20 hover:text-ink border-transparent',
                  )}
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs">{item.description}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 flex gap-3 text-sm">
            <Link
              href="/game"
              className="border-ink/20 text-ink hover:border-crimson/40 hover:text-crimson border border-dashed px-2 py-1 no-underline"
            >
              返回游戏
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
