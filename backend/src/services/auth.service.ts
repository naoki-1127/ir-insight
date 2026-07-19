import { prisma } from "../lib/prisma.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const SECRET = process.env.JWT_SECRET || "secret-key";

const hashPassword = async (password: string) => {
  const hashedPassword = bcrypt.hash(password, 10);
  return hashedPassword;
};
const getUser = async (email: string) =>
  prisma.user.findUnique({
    where: { email: email },
  });

export const generateAccessToken = (userId: string) =>
  jwt.sign({ userId }, SECRET, { expiresIn: "15m" });

export const generateTokens = (userId: string) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = crypto.randomBytes(32).toString("hex");
  return { accessToken, refreshToken };
};

export const registerUser = async (email: string, password: string) => {
  const checkUser = await getUser(email);
  if (checkUser) {
    throw new ConflictError(`${email} はすでに登録されています`);
  }
  const hashedPassword = hashPassword(password);
  const newUser = prisma.user.create({
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
