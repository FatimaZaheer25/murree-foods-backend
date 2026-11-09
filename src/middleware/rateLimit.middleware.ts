import { Request } from "express";
import rateLimit from "express-rate-limit";

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

// Email bhejne wale routes (resend-otp, forgot-password): dono ek hi ginti share karte hain,
// is liye code baar baar mangwa kar 5 koshishon ki had bhi nahi tooti
export const otpCooldown = limiter(MINUTE, 1, "Please wait a minute before requesting another code.", true);
export const otpHourlyLimit = limiter(60 * MINUTE, 5, "Too many codes requested. Please try again in an hour.", true);
