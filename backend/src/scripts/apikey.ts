// MCP 用の API キーを発行・一覧・失効する CLI（ADR 0002）。
//
//   npm run apikey -- create --email you@example.com --name claude-code [--scopes companies:read] [--expires-days 90]
//   npm run apikey -- list   --email you@example.com
//   npm run apikey -- revoke --id <ApiKey.id>
//
// キー本体は create の出力に一度だけ表示される。DB にはハッシュしか残らない。
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../lib/prisma.js";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../services/apiKey.service.js";
import { asUserId } from "../types/branded.js";
import { ALL_SCOPES, isScope, type Scope } from "../types/principal.js";

const usage = `usage:
  apikey create --email <email> --name <name> [--scopes a,b] [--expires-days N]
  apikey list   --email <email>
  apikey revoke --id <id>
scopes: ${ALL_SCOPES.join(", ")}（省略時はすべて）`;

class UsageError extends Error {}

const findUserId = async (email: string | undefined) => {
  if (!email) throw new UsageError("--email は必須です");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UsageError(`ユーザが見つかりません: ${email}`);
  return asUserId(user.id);
};

const parseScopes = (raw: string | undefined): Scope[] => {
  if (!raw) return ALL_SCOPES;
  const scopes = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = scopes.filter((s) => !isScope(s));
  if (unknown.length > 0 || scopes.length === 0) {
    throw new UsageError(`不明なスコープです: ${unknown.join(", ") || raw}`);
  }
  return scopes as Scope[];
};

const parseExpiresAt = (raw: string | undefined): Date | null => {
  if (!raw) return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    throw new UsageError("--expires-days は正の整数で指定してください");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const main = async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      scopes: { type: "string" },
      "expires-days": { type: "string" },
      id: { type: "string" },
    },
  });

  switch (positionals[0]) {
    case "create": {
      const userId = await findUserId(values.email);
      if (!values.name) throw new UsageError("--name は必須です");
      const created = await createApiKey({
        userId,
        name: values.name,
        scopes: parseScopes(values.scopes),
        expiresAt: parseExpiresAt(values["expires-days"]),
      });
      console.log(`id:      ${created.id}`);
      console.log(`scopes:  ${created.scopes.join(",")}`);
      console.log(`expires: ${created.expiresAt?.toISOString() ?? "なし"}`);
      console.log("");
      console.log("API キー（この画面でしか表示されません。安全な場所に保管してください）:");
      console.log(created.key);
      return;
    }
    case "list": {
      const keys = await listApiKeys(await findUserId(values.email));
      console.table(
        keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          scopes: k.scopes.join(","),
          created: k.createdAt.toISOString(),
          expires: k.expiresAt?.toISOString() ?? "",
          lastUsed: k.lastUsedAt?.toISOString() ?? "",
          revoked: k.revokedAt?.toISOString() ?? "",
        })),
      );
      return;
    }
    case "revoke": {
      if (!values.id) throw new UsageError("--id は必須です");
      const revoked = await revokeApiKey(values.id);
      console.log(
        revoked
          ? `失効しました: ${values.id}`
          : `見つからないか、既に失効しています: ${values.id}`,
      );
      if (!revoked) process.exitCode = 1;
      return;
    }
    default:
      throw new UsageError(usage);
  }
};

main()
  .catch((err) => {
    if (err instanceof UsageError) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
