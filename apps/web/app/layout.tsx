import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';

export const metadata: Metadata = {
  title: 'PROPOSAL-3｜法人保険 即時提案',
  description: '商談ログと企業情報から、根拠付きの3パターン提案資料をその場で作成します。',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2d4d' };

const ROLE: Record<string, string> = { sales: '営業', manager: 'マネージャー', admin: '管理者' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="ja">
      <body>
        {user && (
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-navy text-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
              <Link href="/cases" className="text-sm font-bold tracking-wide">
                PROPOSAL-3
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/cases" className="rounded px-2 py-2 hover:bg-white/10">
                  案件
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin/knowledge" className="rounded px-2 py-2 hover:bg-white/10">
                    ナレッジ
                  </Link>
                )}
                {user.role !== 'sales' && (
                  <Link href="/admin/audit" className="rounded px-2 py-2 hover:bg-white/10">
                    監査ログ
                  </Link>
                )}
                <span className="hidden px-2 text-white/70 sm:inline">
                  {user.name}（{ROLE[user.role]}）
                </span>
                <LogoutButton />
              </nav>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
