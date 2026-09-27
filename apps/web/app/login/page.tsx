import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/cases');
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-1 text-xl font-bold text-navy">PROPOSAL-3</h1>
      <p className="mb-6 text-sm text-slate-600">法人保険 営業支援・即時提案</p>
      <LoginForm next={next && next.startsWith('/') ? next : '/cases'} />
      <div className="mt-6 rounded-md bg-slate-100 p-3 text-xs text-slate-600">
        テスト用アカウント（パスワードはすべて <code>password</code>）
        <br />
        営業：sales@example.com ／ マネージャー：manager@example.com ／ 管理者：admin@example.com
      </div>
    </div>
  );
}
