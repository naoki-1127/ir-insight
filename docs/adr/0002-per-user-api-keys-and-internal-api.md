# ADR 0002: ユーザごとの API キーと内部 API

- ステータス：採択
- 日付：2026-11-19

## 背景

MCP サーバ（mcp-server）は現在、ユーザを持たない共有キー（`MCP_API_KEY`）で backend の Web 用 API を呼んでいる。ウォッチリストはユーザごとのデータになった（ADR 0001）ため、共有キーは暫定で `MCP_API_KEY_USER_ID` のユーザとして扱っている。

CLAUDE.md の方針では、mcp-server は「認証 → backend の内部 API 呼び出し → MCP の応答に整形」だけを担当し、DB には直接接続しない。そのため次の 2 つを決める必要がある。

1. MCP の利用者を識別する API キーをどう発行・保存・照合するか
2. mcp-server が backend をどう呼び、backend が呼び出し元とユーザをどう信頼するか

## 決定

### API キー

- **形式**：`iri_` ＋ 32 バイトの乱数（base64url、43 文字）。接頭辞で、どのサービスのキーかを見分けられるようにする
- **保存**：キー本体は保存せず、SHA-256（hex）だけを `ApiKey.keyHash`（一意）に保存する。キーは十分な長さの乱数で総当たりできないため、パスワードと違ってソルトや遅いハッシュ（bcrypt など）は使わない
- **表示**：一覧で見分けるために、先頭 12 文字（`iri_` ＋ 8 文字）を `prefix` に保存する。照合には使わない
- **属性**：`name`（用途のメモ）、`scopes`、`expiresAt`（任意）、`lastUsedAt`、`revokedAt`
- **失効**：行は削除せず、`revokedAt` を入れる（いつ・どのキーを使っていたかの記録を残す）
- **発行**：当面は backend の CLI スクリプトで行う。Web 画面での発行と失効は必要になったら追加する

```
npm run apikey -- create --email <email> --name <name> [--scopes a,b] [--expires-days N]
npm run apikey -- list   --email <email>
npm run apikey -- revoke --id <id>
```

キー本体は `create` の出力に一度だけ表示する。

### スコープ

| スコープ | できること |
|---|---|
| `companies:read` | ウォッチ一覧の取得、EDGAR の企業検索 |
| `companies:write` | 銘柄のウォッチ登録 |

キーの発行時に省略した場合は、すべてのスコープを付ける。Web のログインユーザ（JWT）も、すべてのスコープを持つ Principal として扱う。

### 内部 API（`/internal/*`）

- mcp-server だけが呼ぶ。本番では caddy で外部からの到達を拒否する（多層防御）
- **呼び出し元の認証**：`X-Internal-Secret` が `INTERNAL_API_SECRET` と一致しなければ 401。比較はハッシュにしてから `timingSafeEqual` で行い、値の長さや内容が応答時間から推測されないようにする
- **ユーザ**：`X-User-Id` と `X-Scopes`（カンマ区切り）から Principal を作る。backend は、内部シークレットを知っている mcp-server が認証済みのユーザを渡してくると信頼する。`X-User-Id` がなければ 401、スコープが足りなければ 403
- `INTERNAL_API_SECRET` が設定されていなければ、backend は起動時に終了する

| エンドポイント | Principal | スコープ | 内容 |
|---|---|---|---|
| `POST /internal/auth/api-key` | 不要 | - | `{ apiKey }` を照合し、`{ userId, scopes }` を返す。無効・失効・期限切れなら 401 |
| `GET /internal/companies` | 必須 | `companies:read` | ウォッチ中の銘柄一覧 |
| `GET /internal/companies/search?q=` | 必須 | `companies:read` | EDGAR の企業一覧から検索 |
| `POST /internal/companies` | 必須 | `companies:write` | `{ ticker }` をウォッチに登録 |

### キーの照合を backend で行う

mcp-server は、受け取った API キーをそのまま `POST /internal/auth/api-key` に送り、照合は backend で行う。

- キーの形式・ハッシュ・失効・期限の判定を backend の 1 か所にまとめられる
- mcp-server は DB に接続しないという方針と合う
- キーは内部ネットワーク（Compose のネットワーク）だけを通り、外部 API には渡さない

### Principal をサービス層に渡す

backend の各認証ミドルウェア（JWT、共有キー、内部 API）は `req.principal` を設定し、サービス関数は `Principal` を引数で受け取る。ユーザはこの Principal からのみ決め、リクエストの本文や引数からは受け取らない。

## 検討した他の案

### mcp-server でハッシュ化し、ハッシュだけを backend に送る

採用しない。キー本体が mcp-server から出ないのは利点だが、ハッシュの方式が 2 つのサービスにまたがる取り決めになる。内部ネットワークだけを通るため、本体を送ることの危険は小さいと判断した。

### 署名付きのキー（JWT など）にして、DB を引かずに検証する

採用しない。失効を即座に反映するには結局 DB を引く必要がある。利用者は当面 1 人で、照合の負荷も問題にならない。

### 内部 API でもユーザをキーで毎回照合する（Principal ヘッダを信頼しない）

採用しない。OAuth（フェーズ 4）で入ってくるユーザは API キーを持たないため、入口ごとに backend の照合方法が変わってしまう。入口ごとの認証は mcp-server で行い、backend へは正規化した Principal を渡す形にそろえる。

### IdP でトークンを交換し、backend 向けのトークンで呼ぶ（RFC 8693 / On-Behalf-Of）

mcp-server が受け取った IdP のトークンを IdP に渡し、`aud` が backend のトークンに交換して backend を呼ぶ方式。

採用しない。理由は次のとおり。

- backend と mcp-server は持ち主が同じで、同じホストの同じ Compose ネットワークにいる。backend は「mcp-server が認証したユーザ」を信用してよく、ユーザの資格情報を backend まで持ち込む必要がない
- API キーで入ってきたユーザには交換元となる IdP のトークンがなく、入口によって backend の検証方法が分かれる
- リクエストごと（またはキャッシュが切れるたび）に IdP への問い合わせが増え、IdP の障害の影響も受ける

なお、受け取ったトークンをそのまま下流に渡す（パススルー）ことは、MCP の仕様でも CLAUDE.md でも禁止している。下流がユーザのトークンを必要とする場合は、パススルーではなく交換を使う。

### mcp-server の資格情報を強くし、ユーザを署名付き JWT で渡す

今回の方式と考え方は同じで、mcp-server が入口でユーザを認証し、backend は「mcp-server であること」を確かめたうえで、渡されたユーザを信用する。違うのは部品の強さである。

| 要素 | 今回の方式 | 強化した方式 |
|---|---|---|
| mcp-server 自身の資格情報 | 共有シークレット（`X-Internal-Secret`） | mTLS（クライアント証明書） |
| 検証済みユーザの渡し方 | 署名なしのヘッダ（`X-User-Id`、`X-Scopes`） | 署名付き JWT（`sub`、スコープ、`exp`、`aud`） |

強化した方式の利点は次のとおり。

- **改ざんの検知**：ユーザ情報に署名が付く。今回の方式では、シークレットさえ一致すればヘッダの中身は何でも通る
- **有効期限と宛先**：`exp` を短く（60 秒程度）し、`aud` を backend に限定できる。1 回分のリクエストが漏れても使い回せる範囲が小さい。今回の共有シークレットには期限がなく、漏れれば任意のユーザになりすませる
- **非対称鍵なら backend 側で偽造できない**：mcp-server が秘密鍵で署名し、backend は公開鍵だけを持つ。今回の共有シークレットは両方に同じ値がある
- **mTLS ならシークレットがヘッダに乗らない**：通信路で相互に認証するため、ログやプロキシにシークレットが残らない

今回は採用しない。1 台のホスト、同じ Compose ネットワーク、持ち主は 1 人という構成では、強化で守れる範囲が小さい一方、鍵や証明書の発行・更新・失効を運用するコストが増えるため。

必要になったら、次の順で段階的に強くする。

1. **今回**：共有シークレット＋Principal ヘッダ
2. **署名付き JWT**：mcp-server が非対称鍵（EdDSA など）で短命の JWT（`exp` は 60 秒程度、`aud` は backend）に署名して渡し、backend は公開鍵で検証する。`X-User-Id` と `X-Scopes` は JWT の claim に移す。共有シークレットは残すか、JWT だけにするかをそのときに決める
3. **mTLS**：Compose の内部で CA を運用し、mcp-server にクライアント証明書を持たせる

backend の認証ミドルウェアは `req.principal` を設定するだけで、サービス層は Principal しか見ない。そのため、2 や 3 に移るときは `internalSecretMiddleware` と `internalPrincipalMiddleware` の中身を入れ替えるだけで済み、サービス層は変わらない。

次のどれかに当てはまったら、移行を検討する。

- backend を別の持ち主のサービスにする、または mcp-server と別のホストやネットワークに置く
- 利用者が自分以外にも広がり、内部シークレットの漏えいによる被害が大きくなる
- 下流が IdP のトークンしか受け付けない（この場合はトークン交換を検討する）

## 影響

- mcp-server は、MCP のリクエストごとに `POST /internal/auth/api-key` を 1 回呼ぶ（ステートレスのため）。負荷が問題になったら、mcp-server で短時間キャッシュする
- `ApiKey` はユーザデータだが、照合はユーザが決まる前に行う。RLS を入れる段階で、照合は `SECURITY DEFINER` の関数（`auth_lookup_api_key(hash)`）に移す
- mcp-server を内部 API に切り替えた時点で、`authOrApiKeyMiddleware`、`MCP_API_KEY`、`MCP_API_KEY_USER_ID` を削除する
