import jwt from "jsonwebtoken";
import { CookieOptions, Response } from "express";

// Token banana (wristband)
export const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
  });
};

// Set aur clear dono mein bilkul yahi options hon, warna browser cookie nahi mitata.
// Local: http par lax. Production: https par none (frontend alag domain par bhi ho to chale)
const cookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  };
};

// Token ko cookie (jeb) mein daalna. Cookie utni hi der jitni token ki umar (JWT_EXPIRES_IN)
export const setTokenCookie = (res: Response, token: string) => {
  const { exp } = jwt.decode(token) as { exp: number };
  res.cookie("token", token, { ...cookieOptions(), maxAge: exp * 1000 - Date.now() });
};

// Cookie mitana (logout)
export const clearTokenCookie = (res: Response) => {
  res.clearCookie("token", cookieOptions());
};
