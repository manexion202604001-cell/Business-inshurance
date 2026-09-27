import { prisma } from '@p3/db';
import { requireUser } from '@/lib/session';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ACTION: Record<string, string> = {
  login: 'ログイン', create_case: '案件作成', generate: '3案生成', generate_error: '生成エラー', recalc: '再計算', export_pdf: 'PDF出力', present_slides: 'スライド表示', approve: '承認', unapprove: '承認取消', share: '共有リンク作成', unshare: '共有停止', view_share: '共有閲覧', feedback: 'フィードバック', delete_case: '案件削除', update_case: '案件更新', knowledge_edit: 'ナレッジ編集', knowledge_publish: 'ナレッジ公開', knowledge_restore: 'ナレッジ復元', rates_import: '参考料率インポート',
};

export default async function AuditPage() {
  await requireUser(['manager', 'admin']);
  const [events, feedback] = await Promise.all([
    prisma.auditEvent.findMany({ orderBy: { at: 'desc' }, take: 300, include: { case: { select: { company: { select: { name: true } } } } } }),
    prisma.feedback.groupBy({ by: ['rating'], _count: true }),
  ]);
  const up = feedback.find((f) => f.rating === 1)?._count ?? 0;
  const down = feedback.find((f) => f.rating === -1)?._count ?? 0;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-navy">監査ログ</h1>
      <Card title="フィードバック集計">
        <p className="text-sm">
          👍 {up}件 ／ 👎 {down}件{up + down > 0 && `（そのまま顧客に見せられる割合 ${Math.round((up / (up + down)) * 100)}%）`}
        </p>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-2">日時</th>
              <th className="p-2">誰が</th>
              <th className="p-2">何を</th>
              <th className="p-2">案件</th>
              <th className="p-2">詳細</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap p-2 text-xs">{e.at.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                <td className="p-2 text-xs">{e.actor}</td>
                <td className="p-2">{ACTION[e.action] ?? e.action}</td>
                <td className="p-2 text-xs">{e.case?.company.name ?? '—'}</td>
                <td className="max-w-md p-2 font-mono text-[11px] text-slate-500">{JSON.stringify(e.payload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
