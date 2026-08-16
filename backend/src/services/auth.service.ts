import { prisma } from "../lib/prisma.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export type AuthCredentials = {
  email: string;
  password: string;
};
export type AuthResponse = { accessToken: string } | { error: string };
export type LogoutResponse = { message: string } | { error: string };

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("JWT_SECRET is not set");
}

const hashPassword = async (password: string) => {
  return await bcrypt.hash(password, 10);
};
const getUser = async (email: string) =>
  prisma.user.findUnique({
    where: { email: email },
  });

const createRefreshToken = async (userId: string, refreshToken: string) => {
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: userId,
      expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日
    },
  });
};

export const generateAccessToken = (userId: string) =>
  jwt.sign({ userId }, SECRET, { expiresIn: "15m" });

export const generateTokens = async (userId: string) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = crypto.randomBytes(32).toString("hex");
  await createRefreshToken(userId, refreshToken);
  return { accessToken, refreshToken };
};

export const getRefreshToken = async (refreshToken: string) => {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });
  if (!stored) {
    throw new AuthenticateError(`invalid`);
  }
  if (stored.expiredAt < new Date()) {
    throw new AuthenticateError(`Expired`);
  }
  return stored;
};

export const deleteRefreshToken = async (refreshToken: string) => {
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });
};
export const registerUser = async (email: string, password: string) => {
  const checkUser = await getUser(email);
  if (checkUser) {
    throw new ConflictError(`${email} はすでに登録されています`);
  }
  const hashedPassword = await hashPassword(password);
  const newUser = await prisma.user.create({
    data: {
      email: email,
      password: hashedPassword,
    },
  });
  return newUser;
};

export const loginUser = async (email: string, password: string) => {
  const checkUser = await getUser(email);
  if (!checkUser) {
    throw new AuthenticateError(`メールアドレスが存在しません`);
  }
  const valid = await bcrypt.compare(password, checkUser.password);
  if (!valid) {
    throw new AuthenticateError("パスワードが違います");
  }
  return checkUser;
};

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class AuthenticateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticateError";
  }
}
