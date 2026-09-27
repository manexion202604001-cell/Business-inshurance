'use client';
import { useState } from 'react';
import type { CaseView } from '@/lib/cases';
import { Badge, Card } from './ui';
import { TIER_JA } from './format';

export function TalkMemo({ view, canSeeInternal, issueLabels }: { view: CaseView; canSeeInternal: boolean; issueLabels: Record<string, string> }) {
  const n = view.narrative!;
  const t = n.talkScript;
  const ex = view.extraction;
  const [internal, setInternal] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">社内用：このタブの内容は顧客に見せないでください</div>
      <Card title="トークスクリプト（話す順番）">
        <ol className="space-y-3 text-sm">
          <li>
            <Badge>① オープニング</Badge>
            <p className="mt-1">{t.opening}</p>
          </li>
          <li>
            <Badge>② 課題の言語化</Badge>
            <p className="mt-1">{t.problemFraming}</p>
          </li>
          <li>
            <Badge>③ 3案の説明</Badge>
            {t.planWalkthrough.map((w) => (
              <p key={w.tier} className="mt-1">
                <span className="font-semibold text-accent">{TIER_JA[w.tier]}：</span>
                {w.script}
              </p>
            ))}
          </li>
          <li>
            <Badge>④ クロージングの質問</Badge>
            <p className="mt-1 font-semibold text-navy">{t.closingQuestion}</p>
          </li>
        </ol>
      </Card>
      <Card title="想定反論と切り返し">
        <ul className="space-y-2 text-sm">
          {t.objectionHandling.map((o, i) => (
            <li key={i} className="rounded bg-slate-50 p-2">
              <div className="font-semibold">「{o.objection}」</div>
              <div>→ {o.response}</div>
              {o.backedBy.length > 0 && <div className="text-xs text-slate-500">根拠：{o.backedBy.join('、')}</div>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="根拠メモ（数値の説明方法）">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {n.rationaleMemo.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </Card>
      {ex && (
        <Card title="商談ログから抽出した内容">
          <ul className="space-y-1 text-sm">
            {ex.issues.map((i, k) => (
              <li key={k}>
                <Badge tone="accent">{issueLabels[i.tag] ?? i.tag}</Badge> {i.summary}
                <div className="text-xs text-slate-500">「{i.evidenceQuote}」</div>
              </li>
            ))}
          </ul>
          {ex.objections.length > 0 && <p className="mt-2 text-sm">懸念：{ex.objections.join('／')}</p>}
          {ex.interests.length > 0 && <p className="text-sm">関心：{ex.interests.join('／')}</p>}
          {ex.smallTalkInsights.length > 0 && <p className="text-sm">雑談からの示唆：{ex.smallTalkInsights.join('／')}</p>}
          {(ex.missingInfo.length > 0 || ex.conflicts.length > 0) && (
            <div className="mt-2 rounded bg-amber-50 p-2 text-sm">
              {ex.missingInfo.length > 0 && <div>次回ヒアリング：{ex.missingInfo.join('、')}</div>}
              {ex.conflicts.map((c, i) => (
                <div key={i}>
                  入力とログの食い違い：{c.field}（入力 {c.formValue ?? '—'}／ログ {c.logValue ?? '—'}）「{c.quote}」
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      <Card
        title="営業メモ（PDFと同じ内容）"
        actions={
          canSeeInternal ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              内部参照を表示
            </label>
          ) : null
        }
      >
        <iframe key={String(internal)} title="営業メモ" src={`/api/cases/${view.id}/doc?type=memo${internal ? '&internal=1' : ''}`} className="h-[70vh] w-full rounded border border-slate-200" />
      </Card>
    </div>
  );
}
