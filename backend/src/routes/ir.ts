// src/routes/todo.ts
import { Request, Response, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { summarizeIRText } from "../services/ai.service.js";
import {
  getLatestFilingMeta,
  getCompaniesWithDocument,
  getDocumentContent,
} from "../services/company.service.js";
import type { DocumentId, CompanyId } from "../types/branded.js";

const router = Router();

type SearchQuery = {
  ticker?: string;
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
};
export type SummaryTextResponse =
  | {
      success: true;
      fiscalYear: number;
      quarter: number;
      data: SummaryText;
    }
  | {
      success: false;
      error: string;
    };

// Symbol取得
router.get("/companies", authMiddleware, async (_req, res) => {
  const data = await getCompaniesWithDocument();
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
    const ticker = String(req.query.ticker).trim();
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
    req: Request<{ companyId: string }>,
    res: Response<SummaryTextResponse>,
  ) => {
    const { companyId } = req.params;
    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, error: "企業情報が取得できませんでした" });
    }
    try {
      const document = await prisma.document.findFirst({
        where: {
          companyId,
        },
        orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
        include: {
          contents: {
            orderBy: {
              orderIndex: "asc",
            },
          },
        },
      });
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
        data: result.data,
        fiscalYear: document.fiscalYear,
        quarter: document.quarter,
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
