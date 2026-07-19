import { Router } from "express";
import {
  loginUser,
  registerUser,
  generateTokens,
  generateAccessToken,
  getRefreshToken,
  deleteRefreshToken,
  ConflictError,
  AuthenticateError,
} from "../services/auth.service.js";

const router = Router();

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const { maxAge, ...clearRefreshCookieOptions } = refreshCookieOptions;

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "emailとpasswordは必須" });
    const newUser = await registerUser(email, password);
    // JWT 生成して返す（登録直後に自動ログイン）
    const { accessToken, refreshToken } = await generateTokens(newUser.id);
    res
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
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
    const { accessToken, refreshToken } = await generateTokens(user.id);
    res
      .cookie("refreshToken", refreshToken, refreshCookieOptions)
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
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: "Unauthorized" });
    await deleteRefreshToken(refreshToken);
    res
      .clearCookie("refreshToken", clearRefreshCookieOptions)
      .json({ message: "logout" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: "Unauthorized" });
    const stored = await getRefreshToken(refreshToken);
    const newAccessToken = generateAccessToken(stored.userId);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    if (err instanceof AuthenticateError) {
      return res
        .status(401)
        .clearCookie("refreshToken", clearRefreshCookieOptions)
        .json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

export default router;
