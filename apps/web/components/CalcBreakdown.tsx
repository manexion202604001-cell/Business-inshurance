'use client';
import type { Money } from '@p3/engine';
import type { CaseView } from '@/lib/cases';
import { Badge, Card } from './ui';
import { man } from './format';

function Row({ label, m, strong }: { label: string; m: Money; strong?: boolean }) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-1.5 pr-2">
        <div className={strong ? 'font-semibold' : ''}>{label}</div>
        <div className="text-xs text-slate-500">{m.formula}</div>
        {m.source && <div className="text-[11px] text-slate-400">出典：{m.source}</div>}
      </td>
      <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
        <span className={strong ? 'font-bold text-navy' : ''}>{m.unit === '万円' ? man(m) : `${m.value}${m.unit}`}</span>
        {m.assumed && (
          <Badge tone="yellow" className="ml-1">
            仮置き
          </Badge>
        )}
        <div className="text-[10px] text-slate-400">{m.calcId}</div>
      </td>
    </tr>
  );
}

export function CalcBreakdown({ view }: { view: CaseView }) {
  const c = view.calc!;
  const cv = c.coverage;
  const r = c.retirement;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="事業保障資金（2方式）">
        <table className="w-full text-sm">
          <tbody>
            <Row label={`運転資金方式${cv.adopted === 'B' ? '（採用）' : ''}`} m={cv.methodB} strong={cv.adopted === 'B'} />
            <Row label="　当面の運転資金" m={cv.methodBParts.workingCapital} />
            <Row label="　借入金の返済資金" m={cv.methodBParts.repayment} />
            <Row label="　一括返済が必要な借入金等" m={cv.methodBParts.lumpSum} />
            <Row label={`積上げ方式${cv.adopted === 'A' ? '（採用）' : ''}`} m={cv.methodA} strong={cv.adopted === 'A'} />
            <Row label="　借入金相当額" m={cv.methodAParts.loan} />
            <Row label="　経営立て直し資金" m={cv.methodAParts.rebuild} />
            <Row label="　納税準備資金" m={cv.methodAParts.taxReserve} />
          </tbody>
        </table>
      </Card>
      <Card title="必要保障額と不足額">
        <table className="w-full text-sm">
          <tbody>
            <Row label="事業保障資金" m={cv.businessFund} />
            <Row label="死亡退職金" m={cv.deathRetirement} />
            <Row label="弔慰金" m={cv.condolence} />
            <Row label="必要保障額" m={cv.required} strong />
            <Row label="既存の保障" m={cv.existing} />
            <Row label="不足額" m={cv.gap} strong />
            <Row label="（参考）業務上の死亡の弔慰金" m={cv.condolenceOnDuty} />
            <Row label="死亡退職金の相続税非課税枠" m={cv.inheritanceExempt} />
          </tbody>
        </table>
      </Card>
      <Card title="勇退退職金">
        <table className="w-full text-sm">
          <tbody>
            <Row label="勇退までの年数" m={r.yearsToRetire} />
            <Row label="勇退退職金の目安" m={r.target} strong />
            <Row label="物価上昇を考慮した額" m={r.inflationAdjusted} />
            <Row label="退職所得控除" m={r.deduction} />
            <Row label="課税退職所得" m={r.taxable} />
            <Row label="税負担（退職金で受取）" m={r.taxOnRetirement} />
            <Row label="税負担の増加（役員報酬で受取）" m={r.taxIfSalary} />
            <Row label="受取方法による差" m={r.netVsSalary} />
          </tbody>
        </table>
      </Card>
      <Card title="保険料予算の目安（年額・上限）">
        <table className="w-full text-sm">
          <tbody>
            <Row label="最小プラン" m={c.budget.min} />
            <Row label="バランス型プラン" m={c.budget.balanced} />
            <Row label="最大活用型プラン" m={c.budget.max} />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">予算の目安は経常利益にもとづく設定値（ヒューリスティック）です。事実ではないため、お客さまのご意向を優先してください。</p>
      </Card>
      {view.planSet && (
        <Card title="判断ロジック（ロジック辞書）" className="md:col-span-2">
          <ul className="space-y-1 text-sm">
            {view.planSet.ruleHits.map((h) => (
              <li key={h.id}>
                <Badge tone="navy">{h.id}</Badge> {h.name}：{h.rationale}
              </li>
            ))}
            {view.planSet.ruleHits.length === 0 && <li className="text-slate-500">該当したルールはありません</li>}
          </ul>
          {view.planSet.memoPoints.length > 0 && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">{view.planSet.memoPoints.join(' ')}</p>}
        </Card>
      )}
      {c.assumptions.length > 0 && (
        <Card title="仮置き・補完した値" className="md:col-span-2">
          <ul className="list-disc pl-5 text-sm">
            {c.assumptions.map((a) => (
              <li key={a.field}>
                {a.label}：{a.unit === '万円' ? man(a.value) : `${a.value}${a.unit}`}（{a.reason}）
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
