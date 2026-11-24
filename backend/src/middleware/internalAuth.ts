import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { asUserId } from "../types/branded.js";
import type { Principal, Scope } from "../types/principal.js";

// mcp-server → backend の内部 API 用の認証（ADR 0002）。
// - X-Internal-Secret が INTERNAL_API_SECRET と一致しなければ 401
// - Principal は X-User-Id / X-Scopes から作る（mcp-server が認証済みのユーザ）
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
if (!INTERNAL_API_SECRET) {
  throw new Error("INTERNAL_API_SECRET is not set");
}

// 長さが違うと timingSafeEqual が例外になるため、ハッシュにしてから比べる
const digest = (s: string) => createHash("sha256").update(s).digest();
const expectedDigest = digest(INTERNAL_API_SECRET);

export const internalSecretMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const provided = req.header("x-internal-secret");
  if (!provided || !timingSafeEqual(digest(provided), expectedDigest)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// internalSecretMiddleware の後に使う
export const internalPrincipalMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.header("x-user-id")?.trim();
  if (!userId) {
    return res.status(401).json({ error: "X-User-Id is required" });
  }
  const scopes = (req.header("x-scopes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const principal: Principal = { userId: asUserId(userId), scopes };
  req.principal = principal;
  next();
};

// 認証ミドルウェアの後に使う。スコープが足りなければ 403
export const requireScope =
  (scope: Scope) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.principal) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!req.principal.scopes.includes(scope)) {
      return res.status(403).json({ error: `scope ${scope} is required` });
    }
    next();
  };
