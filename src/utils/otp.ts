import crypto from "crypto";

// Kaam #1: 6-digit random code banana
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Kaam #2: code ko hash karna (DB mein save karne se pehle)
export const hashOTP = (otp: string): string => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};