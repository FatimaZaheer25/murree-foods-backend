import { z } from "zod";

// Har field ek jagah check hoti hai, controller ko saaf data milta hai
const email = z.string("Email is required.").trim().toLowerCase().pipe(z.email("Enter a valid email address."));

const newPassword = z
  .string("Password is required.")
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer."); // bcrypt is se aage parhta hi nahi

const otp = z.string("Code is required.").trim().regex(/^\d{6}$/, "Code must be 6 digits.");

// 0300-1234567 ya 0300 1234567 → 03001234567 (orders bhi yahi istemal karte hain)
export const phone = z
  .string("Phone number is required.")
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^03\d{9}$/, "Enter a valid phone number, e.g. 0300-1234567."));

export const registerSchema = z.object({
  name: z.string("Full name is required.").trim().min(1, "Full name is required.").max(80, "Name is too long."),
  email,
  phone,
  password: newPassword,
});

export const emailSchema = z.object({ email });

export const verifyEmailSchema = z.object({ email, otp });

export const loginSchema = z.object({
  email,
  password: z.string("Password is required.").min(1, "Password is required."),
});

export const resetPasswordSchema = z.object({ email, otp, newPassword });
