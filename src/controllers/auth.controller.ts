import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import { generateOTP, hashOTP } from "../utils/otp";
import { sendEmail } from "../utils/sendEmail";
import { generateToken, setTokenCookie, clearTokenCookie } from "../utils/token";
import { AuthRequest, tokenOf } from "../middleware/auth.middleware";
import { AppName, appOf, WRONG_APP_MESSAGE } from "../utils/app";

// Password sahi hai, is liye batana theek hai ke account kis app ka hai (correctApp se frontend link banata hai)
const wrongApp = (res: Response, role: AppName) =>
  res.status(403).json({ success: false, message: WRONG_APP_MESSAGE[role], correctApp: role });

// Frontend ko user ki ye shakal jati hai (login, /me). Rider ho to us ka status bhi
export const toAuthUser = (user: IUser) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  ...(user.role === "rider" && user.rider
    ? {
        rider: {
          status: user.rider.status,
          vehicleType: user.rider.vehicleType,
          registration: user.rider.registration,
          // Wajah sirf jab abhi bhi lagu ho
          reason: ["rejected", "suspended"].includes(user.rider.status) ? user.rider.reason : undefined,
        },
      }
    : {}),
});

const PHONE_TAKEN = "This phone number is already used by another rider.";

// ================= REGISTER (customer + rider) =================
// Rider bhi yahi raasta: wahi OTP, sirf role "rider" aur gaari ki maloomat. Status "pending" (admin approve karega)
const signup = (role: "customer" | "rider") => async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, vehicleType, registration } = req.body;

    const existingUser = await User.findOne({ email }).select("+otpExpires");
    if (existingUser && existingUser.isVerified) {
      res.status(409).json({ success: false, message: "An account with this email already exists." });
      return;
    }

    if (role === "rider" && (await User.exists({ role: "rider", phone, email: { $ne: email } }))) {
      res.status(409).json({ success: false, message: PHONE_TAKEN });
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

    // Adhoora (verify na hua) account dobara signup par naye form se badal jata hai, role samet
    let user = existingUser;
    if (user) {
      user.name = name;
      user.phone = phone;
      user.password = password;
      user.role = role;
    } else {
      user = new User({ name, email, phone, password, role });
    }
    user.rider = role === "rider" ? { vehicleType, registration, status: "pending", online: false } : undefined;

    user.otpCode = hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = "verify";
    user.otpAttempts = 0;
    await user.save();

    await sendEmail(
      user.email,
      role === "rider" ? "Verify your Murree Foods rider account" : "Verify your Murree Foods account",
      `<h2>Your verification code is: ${otp}</h2><p>This code expires in 10 minutes.</p>`
    );

    res.status(201).json({
      success: true,
      message: "Account created. We sent a verification code to your email.",
    });
  } catch (error) {
    // Ek hi waqt do requests: database ka unique wala error (email, ya rider ka phone)
    const duplicate = error as { code?: number; keyPattern?: Record<string, number> };
    if (duplicate.code === 11000) {
      const message = duplicate.keyPattern?.phone ? PHONE_TAKEN : "An account with this email already exists.";
      res.status(409).json({ success: false, message });
      return;
    }
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const register = signup("customer");
export const registerRider = signup("rider");

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

    // Code sahi: isi app ka account hai to seedha login (dobara password nahi). Doosri app ka ho to sirf verify
    const app = appOf(req);
    if (user.role === app) {
      setTokenCookie(res, app, generateToken(String(user._id)));
      res.status(200).json({ success: true, message: "Email verified. Welcome to Murree Foods!", user: toAuthUser(user) });
      return;
    }

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
// Website (customer) aur Admin panel (admin) dono yahi. Sirf usi app ka account andar aata hai
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const app = appOf(req);

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: "Incorrect email or password." });
      return;
    }
    if (user.role !== app) {
      wrongApp(res, user.role);
      return;
    }
    if (!user.isVerified) {
      res.status(403).json({ success: false, message: "Please verify your email first.", needsVerification: true });
      return;
    }

    const token = generateToken(String(user._id));
    setTokenCookie(res, app, token);

    res.status(200).json({ success: true, message: "Logged in.", user: toAuthUser(user) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= RIDER LOGIN =================
// Email ya phone se. Sirf rider accounts (customer/admin yahan se nahi). Pending/rejected/suspended rider bhi
// login ho sakta hai: frontend us ko panel ki jagah us ka status dikhata hai
export const riderLogin = async (req: Request, res: Response) => {
  try {
    const { identifier, password, remember } = req.body;
    const byEmail = identifier.includes("@");

    const user = await User.findOne(byEmail ? { email: identifier } : { role: "rider", phone: identifier }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: "Incorrect email, phone or password." });
      return;
    }
    if (user.role !== "rider") {
      wrongApp(res, user.role);
      return;
    }
    if (!user.isVerified) {
      res.status(403).json({ success: false, message: "Please verify your email first.", needsVerification: true });
      return;
    }

    // Remember me band: browser band hote hi cookie khatam
    setTokenCookie(res, "rider", generateToken(String(user._id)), remember);

    res.status(200).json({ success: true, message: "Logged in.", user: toAuthUser(user) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= GET ME =================
export const getMe = (req: AuthRequest, res: Response) => {
  const user = req.user as IUser; // protect ne pehle hi dhoond liya

  res.status(200).json({ success: true, user: toAuthUser(user) });
};

// ================= LOGOUT =================
// Sirf isi app ki cookie mitti hai: baaki apps mein login waisa hi rehta hai
export const logout = async (req: Request, res: Response) => {
  const app = appOf(req);
  // Rider logout kare to Offline (order list mein na gine)
  const token = tokenOf(req);
  if (token && app === "rider") {
    try {
      const { id } = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
      await User.updateOne({ _id: id, role: "rider" }, { $set: { "rider.online": false } });
    } catch {
      // Purana ya ghalat token: sirf cookie mitani hai
    }
  }
  clearTokenCookie(res, app);
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

    // Doosri apps ke purane sessions passwordChangedAt se khud khatam ho jate hain
    clearTokenCookie(res, appOf(req));

    res.status(200).json({ success: true, message: "Password changed. Please log in with your new password." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};