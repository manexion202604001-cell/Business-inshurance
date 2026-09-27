'use client';

export function LogoutButton() {
  return (
    <button
      className="rounded px-2 py-2 hover:bg-white/10"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      ログアウト
    </button>
  );
}
