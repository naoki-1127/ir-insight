// src/routes/todo.ts
import { Request, Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getGuidanse, summarizeIRText } from "../services/ai.service.js";
import {
  getLatestFilingMeta,
  getCompaniesWithDocument,
  getArchivedCompaniesWithDocument,
  getDocumentContent,
  getLatestFilingMeta2,
} from "../services/company.service.js";
import type { DocumentId, CompanyId } from "../types/branded.js";

const router = Router();

type SearchQuery = {
  ticker: CompanyId;
};
type LatestFilingMeta = {
  id: DocumentId;
  title: string;
  fileurl: string;
  companyId: CompanyId;
  userId: null;
  fiscalYear: number;
  quarter: number;
  periodType: string;
};
type LatestFilingResponse = LatestFilingMeta | [] | { error: string };
type SummaryText = {
  driver: string | null;
  risks: string[];
  summaries: {
    text: string;
    sentiment: "positive" | "negative" | "neutral";
  }[];
  fiscalYear: number;
  quarter: number;
};
export type SummaryTextResponse =
  | {
      success: true;
      data: SummaryText;
    }
  | {
      success: false;
      error: string;
    };

// Symbol取得（論理削除済みの銘柄は含まない）
router.get("/companies", authMiddleware, async (_req, res) => {
  const data = await getCompaniesWithDocument();
  return res.json(data);
});

// アーカイブ（論理削除済み）の銘柄一覧
router.get("/companies/archived", authMiddleware, async (_req, res) => {
  const data = await getArchivedCompaniesWithDocument();
  return res.json(data);
});

router.get(
  "/detail/:documentId",
  authMiddleware,
  async (req: Request<{ documentId: string }>, res: any) => {
    const { documentId } = req.params;
    if (!documentId) {
      return res.status(400).json({ error: "記事情報が取得できませんでした" });
    }
    const document = await getDocumentContent(documentId);
    return res.json(document);
  },
);

router.get(
  "/summary/latest-id",
  authMiddleware,
  async (
    req: Request<{}, {}, {}, SearchQuery>,
    res: Response<LatestFilingResponse>,
  ) => {
    const ticker = req.query.ticker;
    if (!ticker) return res.json([]);
    console.log("check_ticker", ticker);
    try {
      const latestFiling = await getLatestFilingMeta(ticker);
      return res.json(latestFiling);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "取得に失敗しました" });
    }
  },
);

router.get(
  "/summary/:companyId/text",
  authMiddleware,
  async (
    req: Request<{ companyId: CompanyId }>,
    res: Response<SummaryTextResponse>,
  ) => {
    const { companyId } = req.params;
    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, error: "企業情報が取得できませんでした" });
    }
    try {
      const document = await getLatestFilingMeta2(companyId);
      console.log(document);
      if (!document) {
        return res.status(404).json({
          success: false,
          error: "ドキュメントが見つかりませんでした",
        });
      }
      const contentEn = document.contents[0]?.contentEn;
      if (!contentEn) {
        return res
          .status(400)
          .json({ success: false, error: "8K情報が取得できませんでした" });
      }

      const result = await summarizeIRText(contentEn);
      if (!result.success) {
        return res.json({ success: false, error: result.error });
      }
      return res.json({
        success: true,
        data: {
          ...result.data,
          fiscalYear: document.fiscalYear,
          quarter: document.quarter,
        },
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ success: false, error: "取得に失敗しました" });
    }
  },
);

router.get(
  "/summary/:companyId/text2",
  authMiddleware,
  async (
    req: Request<{ companyId: CompanyId }>,
    res: Response<SummaryTextResponse>,
  ) => {
    const { companyId } = req.params;
    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, error: "企業情報が取得できませんでした" });
    }
    try {
      const document = await getLatestFilingMeta2(companyId);
      if (!document) {
        return res.status(404).json({
          success: false,
          error: "ドキュメントが見つかりませんでした",
        });
      }
      const contentEn = document.contents[0]?.contentEn;
      if (!contentEn) {
        return res
          .status(400)
          .json({ success: false, error: "8K情報が取得できませんでした" });
      }

      const result = await getGuidanse(contentEn);
      if (!result.success) {
        return res.json({ success: false, error: result.error });
      }
      return res.json({
        success: true,
        data: {
          ...result.data,
          fiscalYear: document.fiscalYear,
          quarter: document.quarter,
        },
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ success: false, error: "取得に失敗しました" });
    }
  },
);

export default router;
