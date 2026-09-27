'use client';
import { useState } from 'react';
import { Button } from './ui';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('sales@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
        setBusy(false);
        if (res.ok) window.location.href = next;
        else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'ログインに失敗しました');
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">パスワード</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'ログイン中…' : 'ログイン'}
      </Button>
    </form>
  );
}
