import { Router } from "express";
import {
  register,
  verifyEmail,
  resendOtp,
  login,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { ipLimiter, loginLimiter, otpCooldown, otpHourlyLimit } from "../middleware/rateLimit.middleware";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validators/auth.validator";

const router = Router();

router.post("/register", ipLimiter, validate(registerSchema), register);
router.post("/verify-email", ipLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-otp", ipLimiter, validate(emailSchema), otpCooldown, otpHourlyLimit, resendOtp);
router.post("/login", ipLimiter, validate(loginSchema), loginLimiter, login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.post("/forgot-password", ipLimiter, validate(emailSchema), otpCooldown, otpHourlyLimit, forgotPassword);
router.post("/reset-password", ipLimiter, validate(resetPasswordSchema), resetPassword);

export default router;
