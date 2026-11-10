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

// ================= RIDER =================
export const vehicleType = z.enum(["Bike", "Motorcycle", "Scooter", "Car"], "Choose a vehicle type.");

// "lea-2041" -> "LEA-2041"
export const registration = z
  .string("Vehicle registration is required.")
  .trim()
  .toUpperCase()
  .min(2, "Vehicle registration is required.")
  .max(20, "Vehicle registration is too long.")
  .regex(/^[A-Z0-9][A-Z0-9 -]*$/, "Use letters, numbers and dashes only, e.g. LEA-2041.");

// CNIC yahan jaan boojh kar nahi: frontend bhejta hi nahi, aur bheja bhi jaye to zod use hata deta hai
export const riderRegisterSchema = registerSchema.extend({ vehicleType, registration });

// Email ya phone: dono mein se jo likha ho
export const riderLoginSchema = z.object({
  identifier: z
    .string("Email or phone number is required.")
    .trim()
    .min(1, "Email or phone number is required.")
    .max(254, "Email or phone number is too long.")
    .transform((value) => (value.includes("@") ? value.toLowerCase() : value.replace(/[\s-]/g, "")))
    .refine((value) => z.email().safeParse(value).success || /^03\d{9}$/.test(value), "Enter a valid email or phone number."),
  password: z.string("Password is required.").min(1, "Password is required."),
  remember: z.boolean("Remember me must be true or false.").default(true),
});
