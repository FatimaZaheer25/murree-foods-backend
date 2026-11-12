import { Request } from "express";
import rateLimit from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";

const MINUTE = 60 * 1000;

const limiter = (windowMs: number, limit: number, message: string, byEmail = false, onlyFailures = false) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message },
    skipSuccessfulRequests: onlyFailures,
    // validate() ke baad chalta hai, is liye email yahan saaf (lowercase) milti hai
    ...(byEmail && { keyGenerator: (req: Request) => req.body.email as string }),
  });

// Har IP ke liye moti had (POST routes par)
export const ipLimiter = limiter(15 * MINUTE, 100, "Too many requests. Please try again later.");

// Ek email par ghalat password ki koshishein (sahi login ginti mein nahi)
export const loginLimiter = limiter(
  15 * MINUTE,
  10,
  "Too many failed attempts. Please try again in 15 minutes.",
  true,
  true
);

// Rider login: wahi had, lekin email ya phone (jo likha ho) ke hisaab se
export const riderLoginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many failed attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `rider:${req.body.identifier as string}`,
});

// Email bhejne wale routes (resend-otp, forgot-password): dono ek hi ginti share karte hain,
// is liye code baar baar mangwa kar 5 koshishon ki had bhi nahi tooti
export const otpCooldown = limiter(MINUTE, 1, "Please wait a minute before requesting another code.", true);
// Har user ke 1 ghante mein 10 kamyab orders (protect ke baad lagta hai, is liye user mojood hai)
export const orderLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many orders in a short time. Please try again later." },
  skipFailedRequests: true,
  keyGenerator: (req: Request) => String((req as AuthRequest).user!._id),
});

export const otpHourlyLimit =limiter(60 * MINUTE, 5, "Too many codes requested. Please try again in an hour.", true);

// Contact form: ek IP se ghante mein 5 paigham (ghalat bhare form ginti mein nahi)
export const contactLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "You've sent several messages already. Please try again in an hour." },
  skipFailedRequests: true,
});
