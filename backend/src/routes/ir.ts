// src/routes/todo.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { Request } from "express";
import { summarizeIRText } from "../services/ai.service.js";
import {
  getCompaniesWithDocument,
  getDocumentContent,
} from "../services/company.service.js";

const router = Router();

// Symbol取得
router.get("/companies", authMiddleware, async (_req, res: any) => {
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
  "/summary/:companyId/text",
  authMiddleware,
  async (req: Request<{ companyId: string }>, res: any) => {
    const { companyId } = req.params;
    if (!companyId) {
      return res.status(400).json({ error: "企業情報が取得できませんでした" });
    }
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

    const contentEn = document?.contents[0]?.contentEn;
    if (!contentEn) {
      return res.status(400).json({ error: "8K情報が取得できませんでした" });
    }

    const result = await summarizeIRText(contentEn);
    res.json({
      ...result,
      fiscalYear: document.fiscalYear,
      quarter: document.quarter,
    });
  },
);

export default router;
