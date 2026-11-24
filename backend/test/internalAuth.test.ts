import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

// ミドルウェアは読み込み時に INTERNAL_API_SECRET を検証するため、先に設定してから import する
const SECRET = "test-internal-secret";
process.env.INTERNAL_API_SECRET = SECRET;
const {
  internalSecretMiddleware,
  internalPrincipalMiddleware,
  requireScope,
} = await import("../src/middleware/internalAuth.js");

let server: Server;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  // 実際の /internal ルータと同じ並び：シークレット → (認証前のルート) → Principal → スコープ
  app.use("/internal", internalSecretMiddleware);
  app.post("/internal/auth/api-key", (_req, res) => res.json({ ok: true }));
  app.use("/internal", internalPrincipalMiddleware);
  app.get(
    "/internal/read",
    requireScope("companies:read"),
    (req, res) => res.json(req.principal),
  );
  app.post(
    "/internal/write",
    requireScope("companies:write"),
    (req, res) => res.json(req.principal),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  fetch(base + path, { method, headers });

describe("内部シークレット", () => {
  test("ヘッダがなければ 401", async () => {
    assert.equal((await call("/internal/read", { "x-user-id": "u1" })).status, 401);
    assert.equal((await call("/internal/auth/api-key", {}, "POST")).status, 401);
  });

  test("値が一致しなければ 401", async () => {
    const res = await call("/internal/read", {
      "x-internal-secret": "wrong",
      "x-user-id": "u1",
      "x-scopes": "companies:read",
    });
    assert.equal(res.status, 401);
  });

  test("長さだけ同じで値が違っても 401", async () => {
    const res = await call("/internal/read", {
      "x-internal-secret": "x".repeat(SECRET.length),
      "x-user-id": "u1",
      "x-scopes": "companies:read",
    });
    assert.equal(res.status, 401);
  });

  test("空文字なら 401", async () => {
    const res = await call("/internal/auth/api-key", { "x-internal-secret": "" }, "POST");
    assert.equal(res.status, 401);
  });

  test("一致すれば認証前のルートは Principal なしで通る", async () => {
    const res = await call("/internal/auth/api-key", { "x-internal-secret": SECRET }, "POST");
    assert.equal(res.status, 200);
  });
});

describe("Principal とスコープ", () => {
  test("X-User-Id がなければ 401", async () => {
    const res = await call("/internal/read", {
      "x-internal-secret": SECRET,
      "x-scopes": "companies:read",
    });
    assert.equal(res.status, 401);
  });

  test("X-User-Id が空白だけなら 401", async () => {
    const res = await call("/internal/read", {
      "x-internal-secret": SECRET,
      "x-user-id": "  ",
      "x-scopes": "companies:read",
    });
    assert.equal(res.status, 401);
  });

  test("スコープが足りなければ 403", async () => {
    const res = await call(
      "/internal/write",
      { "x-internal-secret": SECRET, "x-user-id": "u1", "x-scopes": "companies:read" },
      "POST",
    );
    assert.equal(res.status, 403);
  });

  test("スコープがなければ 403", async () => {
    const res = await call("/internal/read", { "x-internal-secret": SECRET, "x-user-id": "u1" });
    assert.equal(res.status, 403);
  });

  test("ヘッダから Principal が作られる", async () => {
    const res = await call("/internal/read", {
      "x-internal-secret": SECRET,
      "x-user-id": "u1",
      "x-scopes": " companies:read , companies:write ",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      userId: "u1",
      scopes: ["companies:read", "companies:write"],
    });
  });
});
