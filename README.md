# PROPOSAL-3　法人保険 営業支援・即時提案AIシステム

商談ログと企業情報から、**根拠付きの3パターン提案資料**（最小／バランス／最大活用）をその場で作成する Web アプリです。
仕様は [`docs/DEVELOPMENT_PROMPT.md`](docs/DEVELOPMENT_PROMPT.md)、判断・仮定の記録は [`docs/DECISIONS.md`](docs/DECISIONS.md) を参照してください。

- **計算はコード、言語化はLLM**：必要保障額（2方式）・死亡退職金・弔慰金・勇退退職金・インフレ・退職所得・税務区分（通達9-3-5の2）・予算の目安はすべて `packages/engine` の純関数で計算（§13 の期待値をテストで固定）
- **数値グラウンディング**：文中の数値が計算結果に存在するかを検証し、違反は再生成→それでも駄目なら該当箇所だけ定型文に差し替え
- **コンプライアンスは fail-closed**：保険会社名・商品名・ファンド名・資料番号のマスキング、節税訴求・断定・比較表現の検出、必須注記のチェックを入力時・生成後・表示/PDF化直前に実施し、1件でも違反があれば出力をブロック
- **APIキーなしでも動作**：Anthropic API キーがない場合はルール抽出＋定型文モードで同じ資料を作成（キーを設定すると Claude による抽出・言語化に自動で切り替わります）

## クイックスタート（テスト利用）

必要なもの：Node.js 20 以上、pnpm 10、（PDF出力用）Chromium

```bash
pnpm install
cp .env.example .env              # 必要に応じて ANTHROPIC_API_KEY などを設定
pnpm bootstrap                    # Prisma Client 生成 → DB 作成（SQLite）→ シード投入 → フォント配置
pnpm build && pnpm start          # 本番モード（http://localhost:3000）
# または開発モード: pnpm dev
```

ログイン用のテストアカウント（パスワードはすべて `password`）

| ロール | メールアドレス | できること |
|---|---|---|
| 営業 | sales@example.com | 案件作成・3案生成・資料出力（自分の案件） |
| マネージャー | manager@example.com | 全案件の閲覧・承認・監査ログ・内部参照の表示 |
| 管理者 | admin@example.com | 上記＋ナレッジ管理（ロジック辞書・辞書・参考料率・設定・版の公開） |

### 使い方（営業担当者）

1. 「＋ 新規作成」→ 商談ログを貼り付け（またはファイル読み込み：txt / md / vtt / srt / docx / pdf）。ログから年商・借入金などの空欄が自動で補完されます
2. 必須項目（年商・借入金・従業員数・代表者の年齢／報酬月額／在任年数）を確認して **「3案を作成」**
3. 生成中は各ステップの進捗と、ログから読み取った課題が表示されます
4. 結果画面のタブ
   - **3案比較**：各案の構成・保障額・充足率・保険料の目安。「推し」に指定すると資料の強調が変わります
   - **顧客用資料**：サマリー型（A4横1枚）／設計書型（A4縦3枚）／スライドのプレビューと PDF ダウンロード
   - **トーク・根拠メモ**（社内用）：トークスクリプト、想定反論と切り返し、数値の説明方法、次回ヒアリング項目
   - **計算の内訳**：2方式の比較、式、入力値、出典、適用したロジック辞書
5. 黄色の「仮置き」値はタップして修正すると、計算（Step3）以降だけを数百ミリ秒で再実行します
6. 「スライド表示」で顧客に画面共有（矢印キー／スワイプ、F で全画面）

サンプルの架空企業3社（`fixtures/cases/`）は新規作成画面の「サンプル」ボタンから読み込めます。シード直後は3社の未作成案件も登録されています。

## Web版（サーバー不要・ブラウザで完結）

計算・コンプライアンスチェック・資料テンプレートはサーバー版と同じコードを、ブラウザだけで動くようにまとめた版です（`apps/artifact`）。同じファイルを2か所で公開できます。

| 公開先 | URL | 案件の保存先 | AIでの文章化 |
|---|---|---|---|
| 一般のWebサイト（GitHub Pages） | https://manexion202604001-cell.github.io/Business-inshurance/ （下記の有効化が必要） | そのブラウザ（バックアップ／復元あり） | 「設定」で各自の Anthropic APIキーを入力した場合 |
| claude.ai アーティファクト | https://claude.ai/artifact/EhJ8jphDRoHVfa64SUbtUS （作成者のみ。共有は「共有」メニューから・組織内のみ） | 利用者の claude.ai アカウント（本人のみ閲覧） | 利用者の Claude 利用枠（初回に許可） |

### GitHub Pages の有効化（初回のみ・リポジトリ管理者）

1. GitHub のリポジトリで **Settings → Pages** を開く
2. **Source** を「Deploy from a branch」にする
3. **Branch** で `claude/vibrant-heisenberg-lco3me`（main にマージ後は `main`）、フォルダ `/docs` を選んで **Save**
4. 1〜2分後に https://manexion202604001-cell.github.io/Business-inshurance/ で開けます

アプリを更新したら `pnpm --filter @p3/artifact build:site` で `docs/index.html` を作り直して push してください。

### Web版でできること・できないこと

- できる：3案作成（ログからの自動補完・仮置き値の修正）、顧客用資料（サマリー／設計書／スライド）のプレビュー、PDF・HTML保存、営業メモ、計算の内訳、推しプランの指定、案件のバックアップ・復元、Claude による文章化（数値・社名・禁止表現は同じチェックを通し、通らない箇所は定型文）
- サーバー版のみ：ログイン・権限、承認フロー、監査ログ、ナレッジ管理画面、docx/pdf の取り込み、文字検索できる PDF（Web版の PDF は画像ベース）
- 案件データはサーバーに送信されません（GitHub Pages 版はブラウザ内のみ）。APIキーはそのブラウザにだけ保存され、Anthropic の API に直接送られます

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db`（`prisma/dev.db`） | 本番は PostgreSQL（`prisma/schema.prisma` の provider を変更） |
| `SESSION_SECRET` | 開発用固定値 | セッション Cookie の署名鍵。**本番では必ず変更** |
| `ANTHROPIC_API_KEY` | なし | 設定すると LLM モード。未設定なら定型文モード |
| `ANTHROPIC_MODEL_MAIN` / `ANTHROPIC_MODEL_FAST` | `claude-sonnet-5` / `claude-haiku-4-5-20251001` | 言語化／抽出・チェック用モデル |
| `P3_LLM_MODE` | `auto` | `auto`（キーがあれば使う）／`on`／`off` |
| `P3_MASK_PII` | なし | `1` でメールアドレス・電話番号も LLM 送信前にマスキング |
| `P3_CHROMIUM_PATH` | 自動検出 | PDF 出力に使う Chromium の実行ファイル（未検出時は Playwright の既定） |

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm lint && pnpm typecheck && pnpm test` | ESLint／型検査／ユニットテスト（Vitest, 123件） |
| `pnpm test:coverage` | engine・compliance のカバレッジ（行 98%） |
| `pnpm test:e2e` | Playwright e2e（390px 幅で 作成→3案→PDF、ナレッジ追加→反映、承認フロー）。事前に `pnpm build` |
| `pnpm poc [caseId\|all]` | UI なしで Step1〜7 を実行し `docs/poc/runs/` に JSON／Markdown を出力 |
| `pnpm render:samples` | 3ケースの PDF／PNG を `docs/poc/renders/` に出力 |
| `pnpm bench [回数]` | 各 Step のレイテンシ（P50/P95）・ブロック率・トークン数を計測 |
| `pnpm db:reset && pnpm db:seed` | DB を初期化（全データ削除）してシードを再投入 |
| `pnpm retention [--dry-run]` | 保持期間（既定365日）を過ぎた案件を削除 |

## 構成

```
apps/web/                Next.js 15（App Router）: 画面・API（SSE 生成、PDF、管理画面）
packages/engine/         純関数：必要保障額・税務区分・退職所得・インフレ・予算・ロジック辞書・3案構成
packages/knowledge/      seed データ（保険種別・税務・ロジック辞書・統計・マスキング・禁止表現・参考料率）と型
packages/compliance/     マスキング・禁止表現・数値グラウンディング・必須注記
packages/llm/            Anthropic クライアント、プロンプト、スキーマ、ルール抽出、定型文ライター、再生成
packages/render/         HTML テンプレート（サマリー／設計書／営業メモ／スライド）、明朝体、PDF 化
packages/pipeline/       Step1〜7 の統合（Web と CLI で共通）
packages/db/             Prisma クライアント、ナレッジの下書き・版の公開
prisma/                  schema.prisma, seed.ts
fixtures/cases/          テスト用の架空企業3社（§13）
docs/                    仕様・判断記録・PoC 評価・Phase4 レポート・レンダリング結果
```

生成パイプライン（1回の「3案を作成」）

| Step | 処理 | 担当 |
|---|---|---|
| 1 | 入力正規化（全角半角・話者ラベル・字幕タイムスタンプ）＋社名・商品名のマスキング | コード |
| 2 | 商談ログ抽出（課題・関心・懸念・既存保険・不足情報・入力との食い違い） | LLM（FAST）／ルール |
| 3 | 計算（2方式・不足額・退職金・インフレ・税務区分・予算） | engine |
| 4 | ロジック辞書で採点 → 3案に割付、参考料率で保険料概算・予算内に調整 | engine |
| 5 | 言語化（根拠文・メリット・注意点・ワンペーパー・トーク・反論対応）＋グラウンディング検証・再生成 | LLM（MAIN）／定型文 |
| 6 | 検証（スキーマ・calcId 参照・マスキング・禁止表現・必須注記・LLM ダブルチェック） | コード＋FAST |
| 7 | レンダリング（サマリー／設計書／スライド／営業メモ）と出力前走査 | コード |

## 注意

- 保険料・返戻率は**開発用サンプル料率**による概算です（実在の商品の料率ではありません）。管理画面の「参考料率」から CSV で実料率を取り込んでください
- 本システムは提案骨子と概算までを扱います。正式な保険料・解約返戻金は保険会社の設計書、個別の税務は税理士・所轄税務署でご確認ください
- 参考資料 PDF は同梱していません（`docs/reference/` に配置する想定。`docs/poc/reference-check.md` 参照）
