import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// prisma の読み込みに DATABASE_URL が要るだけで、このテストでは DB に接続しない
process.env.DATABASE_URL ??= "postgresql://unused@localhost/unused";
const { generateApiKey, hashApiKey, displayPrefix } = await import(
  "../src/services/apiKey.service.js"
);

describe("API キー", () => {
  test("iri_ で始まり、base64url の 43 文字が続く", () => {
    assert.match(generateApiKey(), /^iri_[A-Za-z0-9_-]{43}$/);
  });

  test("毎回違うキーになる", () => {
    const keys = new Set(Array.from({ length: 100 }, generateApiKey));
    assert.equal(keys.size, 100);
  });

  test("ハッシュは SHA-256 の hex で、同じキーなら同じ値", () => {
    const key = generateApiKey();
    assert.equal(hashApiKey(key), createHash("sha256").update(key).digest("hex"));
    assert.equal(hashApiKey(key), hashApiKey(key));
    assert.notEqual(hashApiKey(key), hashApiKey(generateApiKey()));
  });

  test("表示用の接頭辞は先頭 12 文字だけで、キー全体を含まない", () => {
    const key = generateApiKey();
    assert.equal(displayPrefix(key), key.slice(0, 12));
    assert.ok(displayPrefix(key).length < key.length);
  });
});
