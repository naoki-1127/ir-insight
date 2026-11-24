import type { UserId } from "./branded.js";

// どの入口（Web の JWT、MCP の API キー、内部 API）で認証しても、最終的にこの形に正規化する。
// サービス層には Principal を引数で渡し、ユーザはここからのみ決める。
export type Principal = { userId: UserId; scopes: string[] };

export const SCOPES = {
  companiesRead: "companies:read",
  companiesWrite: "companies:write",
} as const;
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: Scope[] = Object.values(SCOPES);

export const isScope = (s: string): s is Scope =>
  (ALL_SCOPES as string[]).includes(s);

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}
