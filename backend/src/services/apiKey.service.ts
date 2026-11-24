import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { asUserId, type UserId } from "../types/branded.js";
import type { Principal, Scope } from "../types/principal.js";

// キーの形式：iri_ + 32 バイトの乱数（base64url）。接頭辞でどのサービスのキーか見分けられるようにする
const KEY_PREFIX = "iri_";
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;

export const generateApiKey = (): string =>
  KEY_PREFIX + randomBytes(32).toString("base64url");

// キーは十分な長さの乱数なので、ソルトなしの SHA-256 で保存する（パスワードとは違い総当たりできない）
export const hashApiKey = (key: string): string =>
  createHash("sha256").update(key).digest("hex");

export const displayPrefix = (key: string): string =>
  key.slice(0, DISPLAY_PREFIX_LENGTH);

export type CreatedApiKey = {
  id: string;
  key: string; // 発行時にだけ返す。DB には保存しない
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
};

export const createApiKey = async (params: {
  userId: UserId;
  name: string;
  scopes: Scope[];
  expiresAt?: Date | null;
}): Promise<CreatedApiKey> => {
  const key = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      userId: params.userId,
      name: params.name,
      prefix: displayPrefix(key),
      keyHash: hashApiKey(key),
      scopes: params.scopes,
      expiresAt: params.expiresAt ?? null,
    },
  });
  return {
    id: created.id,
    key,
    prefix: created.prefix,
    scopes: created.scopes,
    expiresAt: created.expiresAt,
  };
};

// キーを照合して Principal を返す。無効・失効・期限切れなら null
export const verifyApiKey = async (
  key: string,
  now: Date = new Date(),
): Promise<Principal | null> => {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const found = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
  });
  if (!found) return null;
  if (found.revokedAt) return null;
  if (found.expiresAt && found.expiresAt <= now) return null;

  await prisma.apiKey.update({
    where: { id: found.id },
    data: { lastUsedAt: now },
  });
  return { userId: asUserId(found.userId), scopes: found.scopes };
};

export const listApiKeys = (userId: UserId) =>
  prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

// 失効させる。履歴を残すため行は消さない。既に失効済み、または存在しなければ false
export const revokeApiKey = async (id: string): Promise<boolean> => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
};
