import jwt from "jsonwebtoken";
import { CookieOptions, Response } from "express";
import { AppName, cookieNameFor } from "./app";

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

// Token ko us app ki cookie (jeb) mein daalna. Cookie utni hi der jitni token ki umar (JWT_EXPIRES_IN).
// remember = false: "session" cookie, browser band hote hi khatam (token ki umar phir bhi wahi)
export const setTokenCookie = (res: Response, app: AppName, token: string, remember = true) => {
  if (!remember) {
    res.cookie(cookieNameFor(app), token, cookieOptions());
    return;
  }
  const { exp } = jwt.decode(token) as { exp: number };
  res.cookie(cookieNameFor(app), token, { ...cookieOptions(), maxAge: exp * 1000 - Date.now() });
};

// Sirf us app ki cookie mitana (logout). Baaki apps ka login waisa hi rehta hai
export const clearTokenCookie = (res: Response, app: AppName) => {
  res.clearCookie(cookieNameFor(app), cookieOptions());
};
