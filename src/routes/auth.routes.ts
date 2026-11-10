import { Router } from "express";
import {
  register,
  registerRider,
  riderLogin,
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
import { ipLimiter, loginLimiter, otpCooldown, otpHourlyLimit, riderLoginLimiter } from "../middleware/rateLimit.middleware";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  riderLoginSchema,
  riderRegisterSchema,
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

// Rider: alag signup (gaari ki maloomat) aur login (email ya phone). OTP, logout, /me aur reset upar wale hi
router.post("/rider/register", ipLimiter, validate(riderRegisterSchema), registerRider);
router.post("/rider/login", ipLimiter, validate(riderLoginSchema), riderLoginLimiter, riderLogin);

export default router;
