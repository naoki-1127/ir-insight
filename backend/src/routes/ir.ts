// src/routes/todo.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { Request } from "express";
import fs from "fs/promises";
import path from "path";
import { summarizeIRText } from "../services/ai.service.js";
import { getCompaniesWithDocument } from "../services/company.service.js";

const router = Router();

// 全 ir 取得
router.get("/", authMiddleware, async (req: AuthRequest, res: any) => {
  const userId = req.userId;
  const dirPath = path.join(process.cwd(), "uploads", `user_${userId}`);
  const files = await fs.readdir(dirPath);
  const fileList = files.map((file) => ({
    name: file,
    path: path.join(dirPath, file),
  }));
  res.json(fileList);
});

// Symbol取得
router.get("/companies", authMiddleware, async (_req, res: any) => {
  const data = await getCompaniesWithDocument();
  return res.json(data);
});

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
