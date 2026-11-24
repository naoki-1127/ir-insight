# CLAUDE.md

## プロジェクト概要

IR Insight は、米国株の決算（SEC EDGAR の 8-K Item 2.02）を自動取得・要約して見せる Web アプリ。
もともと Web サイト（Vue + Express）として作ったものに、**Claude から使える MCP サーバ（Go）を追加**していく。

- 利用者は当面自分だけ（ブラウザ、Claude Code、のちに Claude アプリのカスタムコネクタ）
- 個人用なので、**AWS Lightsail インスタンス 1 台**にすべて載せる（DB・Redis も同居）
- 費用は最小限にする（追加のマネージドサービスは使わない。例外はバックアップ先のオブジェクトストレージと IdP）
- 個人向けとして設計する。テナント（組織）の層は設けず、データの分離単位は**ユーザ**（`userId`）とする。ポートフォリオとして公開する前提のため、ユーザ間の分離は確実に行う

## アーキテクチャ

Lightsail インスタンス 1 台で Docker Compose を使い、以下のコンテナを動かす。

| コンテナ | 言語 | 役割 |
|---|---|---|
| caddy | - | HTTPS 終端（Let's Encrypt 自動）、リバースプロキシ、frontend の静的配信。外部公開は 443/80 のみ（本番のみ） |
| frontend | Vue 3 + Vite | Web UI。本番はビルド成果物を caddy が配信する（開発時のみ Vite dev server コンテナ） |
| backend | Node (Express + Prisma) | Web 用 API、**MCP サーバ向け内部 API**、BullMQ ワーカー（8-K 取得 → AI 要約） |
| mcp-server | Go | リモート MCP サーバ（Streamable HTTP）。認証して `Principal` を作り、backend の内部 API を呼ぶ |
| edgar-checker | Go | EDGAR の最新 8-K を並行取得するステートレスな内部サービス |
| batch | Node | cron。日次で backend の `/api/companies/check-all` を叩く |
| db | PostgreSQL 15 | 外部に公開しない（Compose の内部ネットワークのみ） |
| redis | Redis 7 | BullMQ のキュー。外部に公開しない |

ホスト名で振り分ける（どれも同じ caddy・同じインスタンス）：

| ホスト | 転送先 |
|---|---|
| `app.example.com` | frontend の静的ファイル |
| `api.example.com` | backend（`/internal/*` は caddy で拒否する） |
| `mcp.example.com` | mcp-server（`/mcp`、`/.well-known/oauth-protected-resource`） |

リクエストの流れ：

```
ブラウザ      → caddy → backend（JWT Cookie 認証）→ db / redis
Claude        → caddy → mcp-server（API キー / OAuth）→ backend /internal/*（内部シークレット＋Principal）→ db
batch (cron)  → backend → edgar-checker → SEC EDGAR
                        → redis → worker → SEC EDGAR / OpenAI → db
```

外部サービス：
- SEC EDGAR：データ取得元（User-Agent 必須、合計 10 req/s 未満）
- OpenAI：決算の要約
- WorkOS AuthKit：IdP（OAuth 対応時。CIMD / DCR に対応）
- オブジェクトストレージ：`pg_dump` の日次バックアップ先

### インスタンスのサイズ
Node ×2、Go ×2、PostgreSQL、Redis が同居するので、**メモリ 2GB 以上のプラン**を前提にする。
各コンテナに `mem_limit` を設定し、本番の Node コンテナは dev サーバではなくビルド済みの JS で動かす。

## mcp-server の役割

- MCP サーバは OAuth 2.1 の**リソースサーバ**として振る舞う。認可サーバは自作しない
- **DB に直接接続しない。** 業務ロジックとスキーマは backend に一本化し、mcp-server は「認証 → backend 内部 API 呼び出し → MCP の応答に整形」だけを担当する
- Streamable HTTP はステートレスで動かす（`StreamableHTTPOptions{Stateless: true}`）
- 公式 SDK `github.com/modelcontextprotocol/go-sdk`（現在 v1.8.0）を使う。認証は `auth.RequireBearerToken`、PRM は `auth.ProtectedResourceMetadataHandler` を使う

## 認証・認可

### 入口ごとの認証方式

| 入口 | 方式 | 実装場所 |
|---|---|---|
| Web（ブラウザ） | 既存の JWT（アクセストークン＋リフレッシュトークン Cookie） | backend `middleware/auth.ts` |
| MCP：API キー（フェーズ 1） | `Authorization: Bearer <key>`。キーは SHA-256 でハッシュ化して DB に保存 | mcp-server が backend の内部 API で照合 |
| MCP：OAuth（フェーズ 4） | WorkOS 発行の JWT を JWKS で検証。`iss`、`exp`、`aud` を必ず検証 | mcp-server |
| mcp-server → backend | `X-Internal-Secret` ＋ Principal ヘッダ（`X-User-Id` / `X-Scopes`） | backend `internalAuthMiddleware` |
| batch → backend | `x-batch-secret` | backend |

- MCP で未認証のときは `401` と `WWW-Authenticate: Bearer resource_metadata="<PUBLIC_URL>/.well-known/oauth-protected-resource"` を返す
- `/.well-known/oauth-protected-resource`（RFC 9728）を公開する。`resource`（`<PUBLIC_URL>/mcp`）と `authorization_servers` は設定から組み立てる
- 既存の `authOrApiKeyMiddleware`（共有キー `MCP_API_KEY`。暫定で `MCP_API_KEY_USER_ID` のユーザとして扱う）は廃止し、内部 API に置き換える

### Principal
どの入口でも、最終的に同じ形に正規化する。

```go
// mcp-server
type Principal struct {
	UserID   string
	Scopes   []string
}
```
```ts
// backend
type Principal = { userId: UserId; scopes: string[] };
```
- mcp-server：認証ミドルウェアで context に格納し、以降は `PrincipalFrom(ctx)` からのみ取得する
- backend：各認証ミドルウェアが `req.principal` を設定し、サービス層には `Principal` を引数で渡す

### 守るべきルール
- **ツールや API の引数で `userId` を受け取らない。** ユーザは必ず Principal から決める
- 利用者のトークンを外部 API（OpenAI、EDGAR など）にパススルーしない
- OAuth の `aud` が自サーバ（`<PUBLIC_URL>/mcp`）であることを必ず確認する
- backend の `/internal/*` は内部シークレットが一致しない限り 401 にし、caddy でも外部から到達できないようにする
- 認証を省略する開発モードは作らない。作る場合は `APP_ENV=local` かつ明示フラグの両方を必須にし、本番で有効なら起動時に落とす

## データ設計

- スキーマの所有者は **backend（Prisma）**。マイグレーションは `backend/prisma/migrations` に一本化し、Prisma で表せない RLS やロールは SQL を手書きしたマイグレーションで追加する
- ユーザ間の分離は、共有 DB＋`userId` 列で行う
- **二重の分離**
  - アプリ層：backend のサービス関数は `Principal` を必須引数にする
  - DB 層：PostgreSQL の Row Level Security。Prisma の `$transaction` 内で `SELECT set_config('app.user_id', $1, true)` を実行する（Prisma Client Extension にまとめる）
- DB ロールを分ける
  - マイグレーション用（テーブル所有者）：`MIGRATION_DATABASE_URL`
  - アプリ用（所有者ではなく `NOBYPASSRLS`）：`DATABASE_URL`。所有者は RLS をバイパスするため
- データの区分
  - **共有データ**（RLS なし）：`Company`、`Document`（EDGAR 由来）、`DocumentContent`、`Financial`
  - **ユーザデータ**（RLS あり）：`User`、`ApiKey`、`Watchlist`、`Setting`、`AuditLog`、`RefreshToken`
- 現状の `Company` は全員共通の「登録済み銘柄」になっている。**ユーザごとのウォッチリスト（`Watchlist`）**に移し、`Company` は EDGAR の企業マスタとして共有する
  - マスタは事前に全件入れず、誰かが銘柄を登録した時点で EDGAR で実在を確認して upsert する（遅延登録）。アーカイブは `Watchlist.archivedAt` で表し、マスタは消さない。`check-all` はアーカイブされていないウォッチがある銘柄だけを対象にする（[ADR 0001](docs/adr/0001-shared-company-master-and-watchlist.md)）
- API キーの照合はユーザが決まる前に行うため、RLS の例外は `SECURITY DEFINER` 関数（例：`auth_lookup_api_key(hash)`）1 か所に閉じ込める

```sql
ALTER TABLE "Watchlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Watchlist" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON "Watchlist"
  USING ("userId" = current_setting('app.user_id'))
  WITH CHECK ("userId" = current_setting('app.user_id'));
```

## ユーザ単位の機能

- 認可：スコープ／ロールでツールごとの利用可否を制御する（例：`register_company` はウォッチ追加なので、認証済みのユーザなら使える。[ADR 0001](docs/adr/0001-shared-company-master-and-watchlist.md)）
- レート制限：ユーザ単位で行う
- 監査ログ：誰が・いつ・どのツール（API）を・どの引数で呼んだかを残す
- ログには必ず `user_id` を付ける

## 設定（12-Factor）

コードは 1 つにし、環境ごとの違いはすべて環境変数で吸収する。各サービスは起動時に必須項目を検証し、不足していれば即終了する（fail fast）。
Compose 用の env はリポジトリ直下の `.env.local` と `.env.prod` に置く（`--env-file` で指定する）。

### mcp-server
| 変数 | ローカル | 本番 |
|---|---|---|
| `APP_ENV` | `local` | `prod` |
| `LISTEN_ADDR` | `:8081` | `:8081` |
| `PUBLIC_URL` | `http://localhost:8081` | `https://mcp.example.com` |
| `BACKEND_URL` | `http://backend:3000` | `http://backend:3000` |
| `INTERNAL_API_SECRET` | 任意の値 | ランダムな値 |
| `AUTH_MODES` | `apikey` | `apikey,oauth` |
| `OIDC_ISSUER` / `OIDC_AUDIENCE` | WorkOS 開発環境 | WorkOS 本番環境 |
| `LOG_FORMAT` | `text` | `json` |

### backend
`PORT`、`FRONTEND_URL`、`DATABASE_URL`（アプリ用ロール）、`MIGRATION_DATABASE_URL`（所有者ロール）、`JWT_SECRET`、
`INTERNAL_API_SECRET`、`BATCH_SECRET`、`REDIS_HOST` / `REDIS_PORT`、`EDGAR_CHECKER_URL`、`OPENAI_API_KEY`

### その他
- edgar-checker：`SEC_USER_AGENT`（本番は実在する連絡先を必須にする）、`PORT`
- batch：`BACKEND_URL`、`CRON_SCHEDULE`、`BATCH_SECRET`
- frontend：`VITE_API_BASE_URL`（ビルド時に埋め込まれる）

### 注意
- `PUBLIC_URL` はハードコードしない（Protected Resource Metadata と audience の検証がこれに依存する）
- `.env.example` だけを git 管理し、`.env*` はコミットしない

## リポジトリ構成

```
.
├── frontend/                 # Vue 3 + Vite（Web UI）
├── backend/                  # Express + Prisma + BullMQ
│   ├── prisma/               # schema.prisma, migrations（RLS・ロールの SQL もここ）
│   └── src/
│       ├── routes/           # Web 用 API ＋ internal.ts（mcp-server 向け）
│       ├── middleware/       # JWT / 内部シークレット / batch → Principal
│       ├── services/         # 業務ロジック（Principal 必須）
│       ├── queues/           # BullMQ（8-K 取得 → 要約）
│       └── lib/              # prisma（RLS 用の拡張）, redis
├── batch/                    # Node cron
├── edgar-checker/            # Go：EDGAR 最新 8-K の並行取得
├── mcp-server/               # Go：リモート MCP サーバ
│   ├── main.go
│   └── internal/
│       ├── config/           # 環境変数 → Config
│       ├── auth/             # API キー / JWT 検証 → Principal、PRM
│       ├── backend/          # backend 内部 API クライアント
│       └── tools/            # MCP ツール定義・ハンドラ
├── deploy/
│   ├── Caddyfile
│   └── backup.sh             # pg_dump → オブジェクトストレージ
├── docs/adr/                 # 設計判断の記録
├── go.mod                    # Go はルートの module `irinsight` を共有
├── docker-compose.yml        # 共通
├── docker-compose.local.yml  # ローカル用（Caddy なし、DB / Redis のポート公開可）
├── docker-compose.prod.yml   # 本番用（Caddy 追加、caddy 以外はポート非公開）
└── .env.example
```

## 開発・運用

- 起動
  - ローカル：`docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.local up`
  - 本番：`docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d`
- ポートの公開は override 側だけで行う。共通の `docker-compose.yml` には `ports:` を書かない
- ローカルと本番で同じ PostgreSQL のメジャーバージョン（15）を使う。SQLite で代用しない
- マイグレーションは `prisma migrate deploy` で両環境に適用する（所有者ロールで実行する）
- MCP 用の API キーは backend の CLI で発行・一覧・失効する（`npm run apikey -- create --email <email> --name <name>`。[ADR 0002](docs/adr/0002-per-user-api-keys-and-internal-api.md)）
- backend のテスト：`npm test`（Node のテストランナーを tsx で実行する）
- MCP の動作確認
  - リモート（HTTP）：MCP Inspector か Claude Code から `http://localhost:8081/mcp`
- Go のビルド成果物（`mcp-server/mcp-server`、`edgar-checker/edgar-checker`）はコミットしない
- デプロイ：GitHub Actions でイメージをビルド → GHCR に push → SSH で `docker compose pull && docker compose up -d`
- バックアップ：cron で日次 `pg_dump` → オブジェクトストレージ。Lightsail の自動スナップショットも併用する。復元手順は実際に試して検証しておく
- Lightsail のファイアウォール：443/80 だけを公開し、SSH は自分の IP に限定する

## 進め方（フェーズ）

1. **MCP のリモート化と土台**
   - mcp-server：Config、Streamable HTTP 化、Principal、API キー認証、PRM
   - backend：ユーザデータのテーブル（RLS とロール分離込み）、内部 API、`Watchlist`
   - 既存のツール（`register_company`、`get_company`）を内部 API 経由に移す
2. **品質**
   - ユーザ間分離の統合テスト、監査ログ、CI
   - 本番用 Dockerfile（Node のビルド、frontend の静的ビルド）
3. **Lightsail デプロイ**
   - Caddy、メモリ制限、バックアップ
   - Web と Claude Code の両方から接続を確認する
4. **OAuth 対応**
   - WorkOS AuthKit と連携し、Claude アプリ（スマホ）から接続する
   - Web のログインも同じ IdP に寄せるかを検討する
5. **ドキュメント**
   - README（構成図、認証シーケンス図、ユーザ間の分離方針）、ADR

## テストで必ず保証すること

- ユーザ A のトークンでユーザ B のデータが取得できない（アプリ層・RLS の両方）
- 無効・期限切れ・audience 違いのトークンが 401 になる
- 401 応答に正しい `WWW-Authenticate` ヘッダが付く
- 内部シークレットなし、または不一致の `/internal/*` 呼び出しが 401 になる

## 作業時のお願い

- 設計判断を伴う変更をしたら `docs/adr/` に ADR を追加する
- go-sdk の API はバージョンによって変わるため、実装前に `go.mod` のバージョンで API を確認する
- Prisma もメジャーバージョンで設定方法が変わる（`prisma.config.ts`）。使用中のバージョンを確認してから変更する
