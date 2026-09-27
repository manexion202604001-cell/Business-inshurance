# 参考資料との突き合わせ（Phase 1）

## 状況

`docs/reference/` に参考資料 PDF（6点）が配置されていないため、PyMuPDF による抽出（`docs/poc/extracted/`）と原文との突き合わせは **未実施** です。
実装は `docs/DEVELOPMENT_PROMPT.md` の §7・§13・付録A に抽出済みの値を正としています（DECISIONS D01）。

## 仕様書の値と実装の照合（実施済み）

| 項目 | 仕様の値 | 実装・テスト | 結果 |
|---|---|---|---|
| 運転資金方式の例 | (500+200)×12＋50×12＋3,000＝12,000 | `coverage.test.ts` | 一致 |
| 死亡退職金の例 | 190×12×2.4＝5,472 | `coverage.test.ts` | 一致 |
| 積上げ方式の納税準備資金 | 実効税率33.58%でグロスアップ | ケースA 22,751／B 3,337／C 9,707 | 一致 |
| インフレ | 3,600万円・2.0%・20年→約5,349万円（差額約1,749万円） | `retirement.test.ts` | 一致 |
| 実質価値 | 1,000万円・2.0%：10年820／20年673／30年552 | `retirement.test.ts` | 一致 |
| 退職所得控除 | 20年以下40万×年（最低80万）、超800万＋70万×(年−20) | `retirement.test.ts` | 一致 |
| 税務区分の仕訳例 | 区分2：40/60、累計640、取崩164／区分3：60/40、累計960、取崩196 | `tax.test.ts` | 一致 |
| 区分4 | 9/10→7/10切替、最低5年（10年未満は50%）、延長規定 | `tax.test.ts` | 実装・テスト済み |
| §13 ケースA〜C | 各期待値 | `coverage.test.ts`・`rules-plans.test.ts` | すべて一致 |

## 仕様書内で見つかった不整合

| 箇所 | 内容 | 対応 |
|---|---|---|
| §13 ケースC の商談ログ | 「売上は40億くらい」だが入力値は年商 40,000万円（＝4億円） | サンプルログはそのまま採用し、**入力とログの食い違い（conflicts）** として検出・表示する例にした。計算は入力値を優先 |
| §13 ケースC の期待ルール | 従業員30名だが R05（従業員退職金）が期待ルールに含まれない | ケースCのログに「従業員の退職金は中退共に入ってる」を追加し、準備済みと判定（DECISIONS P06） |

## 資料配置後の手順

```bash
pip install pymupdf
python - <<'PY'
import fitz, pathlib
out = pathlib.Path('docs/poc/extracted'); out.mkdir(parents=True, exist_ok=True)
for pdf in pathlib.Path('docs/reference').glob('*.pdf'):
    doc = fitz.open(pdf)
    (out / f'{pdf.stem}.txt').write_text('\n\n'.join(f'--- p{i+1} ---\n' + p.get_text() for i, p in enumerate(doc)), encoding='utf-8')
    for i, p in enumerate(doc):  # 数字が欠落するページの目視確認用
        p.get_pixmap(dpi=110).save(out / f'{pdf.stem}-p{i+1}.png')
PY
```

抽出後、上表の各項目と付録Aの数値（税務区分・功績倍率・返戻率例・統計値）を照合し、差異があれば管理画面（ナレッジ管理）で修正して新しい版を公開してください。
