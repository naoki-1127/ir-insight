import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  loginUser,
  registerUser,
  generateTokens,
  generateAccessToken,
  ConflictError,
  AuthenticateError,
} from "../services/auth.service.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const newUser = await registerUser(email, password);
    // JWT 生成して返す（登録直後に自動ログイン）
    const { accessToken, refreshToken } = generateTokens(newUser.id);
    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ accessToken });
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// --- ログイン ---
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "emailとpasswordは必須" });
    const user = await loginUser(email, password);
    const { accessToken, refreshToken } = generateTokens(user.id);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日
      },
    });
    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ accessToken });
  } catch (err) {
    if (err instanceof AuthenticateError) {
      return res.status(401).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  await prisma.refreshToken.delete({
    where: { token: refreshToken },
  });
  res.json({ message: "logout" });
});

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });
  if (!stored) return res.status(401).json({ error: "Invalid" });
  if (stored.expiredAt < new Date()) {
    return res.status(401).json({ error: "Expired" });
  }
  const newAccessToken = generateAccessToken(stored.userId);
  res.json({ accessToken: newAccessToken });
});

router.get("/", async (_req, res) => {
  const result = await prisma.$queryRaw`SELECT * FROM now()`;
  res.json(result); // .rows は pg の Pool 用。$queryRaw は配列をそのまま返す
});

router.get("/do", async (_req, res) => {
  const result = await prisma.$queryRaw`SELECT * FROM User`;
  res.json(result); // .rows は pg の Pool 用。$queryRaw は配列をそのまま返す
});

export default router;
