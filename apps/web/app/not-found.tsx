import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mt-10 text-center">
      <p className="text-lg font-bold text-navy">ページが見つかりません</p>
      <Link href="/cases" className="mt-4 inline-block text-sm text-navy underline">
        案件一覧へ
      </Link>
    </div>
  );
}
