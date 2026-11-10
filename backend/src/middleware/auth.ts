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

// MCPサーバーなど、ユーザーを持たない内部クライアント向け。
// JWT の代わりに x-api-key ヘッダーの共有シークレット(MCP_API_KEY)でも通す。
// 全ルートに付けると削除などもAPIキーで可能になるため、必要なルートにだけ付けること。
export const authOrApiKeyMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = process.env.MCP_API_KEY;
  const provided = req.headers["x-api-key"];
  if (apiKey && typeof provided === "string" && provided === apiKey) {
    return next();
  }
  return authMiddleware(req, res, next);
};
