import { Router, type Request, type Response } from "express";
import {
  internalPrincipalMiddleware,
  internalSecretMiddleware,
  requireScope,
} from "../middleware/internalAuth.js";
import { requirePrincipal } from "../middleware/auth.js";
import { verifyApiKey } from "../services/apiKey.service.js";
import {
  getCompaniesWithDocument,
  NotFoundError,
  registerCompany,
  searchCompanies,
} from "../services/company.service.js";
import { SCOPES } from "../types/principal.js";

// mcp-server 向けの内部 API（ADR 0002）。外部からは caddy で到達できないようにする
const router = Router();
router.use(internalSecretMiddleware);

// POST /internal/auth/api-key
// API キーを照合して Principal を返す。ユーザが決まる前の処理なので Principal ヘッダは不要
router.post(
  "/auth/api-key",
  async (req: Request<{}, {}, { apiKey?: unknown }>, res: Response) => {
    const { apiKey } = req.body ?? {};
    if (typeof apiKey !== "string" || !apiKey) {
      return res.status(400).json({ error: "apiKey は必須です" });
    }
    try {
      const principal = await verifyApiKey(apiKey);
      if (!principal) {
        return res.status(401).json({ error: "invalid api key" });
      }
      return res.json(principal);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "サーバーエラー" });
    }
  },
);

// ここから下はユーザが決まっている（Principal ヘッダ必須）
router.use(internalPrincipalMiddleware);

// GET /internal/companies：ウォッチ中の銘柄一覧
router.get(
  "/companies",
  requireScope(SCOPES.companiesRead),
  async (req: Request, res: Response) => {
    try {
      return res.json(await getCompaniesWithDocument(requirePrincipal(req)));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "取得に失敗しました" });
    }
  },
);

// GET /internal/companies/search?q=：EDGAR の企業一覧から検索
router.get(
  "/companies/search",
  requireScope(SCOPES.companiesRead),
  async (req: Request<{}, {}, {}, { q?: string }>, res: Response) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return res.json([]);
    try {
      return res.json(await searchCompanies(q));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "検索に失敗しました" });
    }
  },
);

// POST /internal/companies：銘柄をウォッチに登録する
router.post(
  "/companies",
  requireScope(SCOPES.companiesWrite),
  async (req: Request<{}, {}, { ticker?: unknown }>, res: Response) => {
    const { ticker } = req.body ?? {};
    if (typeof ticker !== "string" || !ticker) {
      return res.status(400).json({ error: "ticker は必須です" });
    }
    try {
      const { company } = await registerCompany(requirePrincipal(req), ticker);
      return res.json({ company });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      console.error(err);
      return res.status(500).json({ error: "サーバーエラー" });
    }
  },
);

export default router;
