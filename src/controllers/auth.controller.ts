import { Request, Response } from "express";
import User, { IUser } from "../models/User";
import { generateOTP, hashOTP } from "../utils/otp";
import { sendEmail } from "../utils/sendEmail";
import { generateToken, setTokenCookie, clearTokenCookie } from "../utils/token";
import { AuthRequest } from "../middleware/auth.middleware";

// ================= REGISTER =================
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email }).select("+otpExpires");
    if (existingUser && existingUser.isVerified) {
      res.status(409).json({ success: false, message: "An account with this email already exists." });
      return;
    }

    // Code abhi chal raha hai: koi aur is email se dobara register kar ke password na badal sake
    if (existingUser?.otpExpires && existingUser.otpExpires > new Date()) {
      res.status(200).json({
        success: true,
        message: "A code was already sent to this email. Enter it or request a new one.",
      });
      return;
    }

    const otp = generateOTP();

    let user = existingUser;
    if (user) {
      user.name = name;
      user.phone = phone;
      user.password = password;
    } else {
      user = new User({ name, email, phone, password });
    }

    user.otpCode = hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = "verify";
    user.otpAttempts = 0;
    await user.save();

    await sendEmail(
      user.email,
      "Verify your Murree Foods account",
      `<h2>Your verification code is: ${otp}</h2><p>This code expires in 10 minutes.</p>`
    );

    res.status(201).json({
      success: true,
      message: "Account created. We sent a verification code to your email.",
    });
  } catch (error) {
    // Ek hi waqt do requests: database ka unique email wala error
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ success: false, message: "An account with this email already exists." });
      return;
    }
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= VERIFY EMAIL =================
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email }).select("+otpCode +otpExpires +otpPurpose +otpAttempts");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }
    if (user.isVerified) {
      res.status(400).json({ success: false, message: "This email is already verified." });
      return;
    }
    if (!user.otpCode || !user.otpExpires || user.otpPurpose !== "verify") {
      res.status(400).json({ success: false, message: "No active code. Please request a new one." });
      return;
    }
    if (user.otpExpires < new Date()) {
      res.status(400).json({ success: false, message: "This code has expired. Please request a new one." });
      return;
    }
    if (user.otpAttempts >= 5) {
      res.status(429).json({ success: false, message: "Too many wrong attempts. Please request a new code." });
      return;
    }
    if (hashOTP(otp) !== user.otpCode) {
      user.otpAttempts += 1;
      await user.save();
      res.status(400).json({ success: false, message: "Incorrect code." });
      return;
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpPurpose = undefined;
    user.otpAttempts = 0;
    await user.save();

    res.status(200).json({ success: true, message: "Email verified. You can now log in." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= RESEND OTP =================
export const resendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }
    if (user.isVerified) {
      res.status(400).json({ success: false, message: "This email is already verified." });
      return;
    }

    const otp = generateOTP();
    user.otpCode = hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = "verify";
    user.otpAttempts = 0;
    await user.save();

    await sendEmail(
      user.email,
      "Your new Murree Foods verification code",
      `<h2>Your new verification code is: ${otp}</h2><p>This code expires in 10 minutes.</p>`
    );

    res.status(200).json({ success: true, message: "A new code has been sent to your email." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= LOGIN =================
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: "Incorrect email or password." });
      return;
    }
    if (!user.isVerified) {
      res.status(403).json({ success: false, message: "Please verify your email first." });
      return;
    }

    const token = generateToken(String(user._id));
    setTokenCookie(res, token);

    res.status(200).json({
      success: true,
      message: "Logged in.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= GET ME =================
export const getMe = (req: AuthRequest, res: Response) => {
  const user = req.user as IUser; // protect ne pehle hi dhoond liya

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

// ================= LOGOUT =================
export const logout = (req: Request, res: Response) => {
  clearTokenCookie(res);
  res.status(200).json({ success: true, message: "Logged out." });
};

// ================= FORGOT PASSWORD =================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const message = "If this email is registered, a reset code has been sent.";

    const user = await User.findOne({ email });

    if (!user) {
      res.status(200).json({ success: true, message });
      return;
    }

    const otp = generateOTP();
    user.otpCode = hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = "reset";
    user.otpAttempts = 0;
    await user.save();

    await sendEmail(
      user.email,
      "Reset your Murree Foods password",
      `<h2>Your password reset code is: ${otp}</h2>
       <p>This code expires in 10 minutes.</p>
       <p>If you didn't request this, you can ignore this email.</p>`
    );

    res.status(200).json({ success: true, message });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= RESET PASSWORD =================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email }).select("+otpCode +otpExpires +otpPurpose +otpAttempts");

    if (!user || !user.otpCode || !user.otpExpires || user.otpPurpose !== "reset") {
      res.status(400).json({ success: false, message: "This code is incorrect or has expired." });
      return;
    }
    if (user.otpExpires < new Date()) {
      res.status(400).json({ success: false, message: "This code has expired. Please start the password reset again." });
      return;
    }
    if (user.otpAttempts >= 5) {
      res.status(429).json({ success: false, message: "Too many wrong attempts. Please start the password reset again." });
      return;
    }
    if (hashOTP(otp) !== user.otpCode) {
      user.otpAttempts += 1;
      await user.save();
      res.status(400).json({ success: false, message: "Incorrect code." });
      return;
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date(); // purane saare sessions khatam (protect dekhta hai)
    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpPurpose = undefined;
    user.otpAttempts = 0;
    await user.save();

    clearTokenCookie(res);

    res.status(200).json({ success: true, message: "Password changed. Please log in with your new password." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};