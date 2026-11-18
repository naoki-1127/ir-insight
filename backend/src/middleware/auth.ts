import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("JWT_SECRET is not set");
}

export type AuthRequest<T = any> = Request<{}, {}, T> & {
  userId?: string;
};

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// 共有キー(MCP_API_KEY)で呼ばれたときに、どのユーザとして扱うか。
// ウォッチはユーザごとなので、共有キーにもユーザを割り当てる必要がある。
// ユーザごとの API キー（内部 API）に置き換えるまでの暫定措置。
const MCP_API_KEY_USER_ID = process.env.MCP_API_KEY_USER_ID;
if (process.env.MCP_API_KEY && !MCP_API_KEY_USER_ID) {
  throw new Error("MCP_API_KEY_USER_ID is required when MCP_API_KEY is set");
}

// MCPサーバーなど、ユーザーを持たない内部クライアント向け。
// JWT の代わりに x-api-key ヘッダーの共有シークレット(MCP_API_KEY)でも通し、
// MCP_API_KEY_USER_ID のユーザとして扱う。
// 全ルートに付けると削除などもAPIキーで可能になるため、必要なルートにだけ付けること。
export const authOrApiKeyMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = process.env.MCP_API_KEY;
  const provided = req.headers["x-api-key"];
  if (apiKey && typeof provided === "string" && provided === apiKey) {
    req.userId = MCP_API_KEY_USER_ID;
    return next();
  }
  return authMiddleware(req, res, next);
};

// 認証ミドルウェアの後で使う。userId が無ければ認証ミドルウェアの付け忘れなので例外にする
export const requireUserId = (req: Request): string => {
  const userId = (req as AuthRequest).userId;
  if (!userId) {
    throw new Error("userId is not set. Is the auth middleware missing?");
  }
  return userId;
};
