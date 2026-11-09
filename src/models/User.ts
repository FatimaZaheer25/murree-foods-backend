import { Schema, model, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "customer" | "admin";
  isVerified: boolean;
  otpCode?: string;
  otpExpires?: Date;
  otpPurpose?: "verify" | "reset";
  otpAttempts: number;
  passwordChangedAt?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false },

    // OTP fields (email verify + password reset dono ke liye)
    otpCode: { type: String, select: false },      // hashed code
    otpExpires: { type: Date, select: false },
    otpPurpose: { type: String, enum: ["verify", "reset"], select: false },
    otpAttempts: { type: Number, default: 0, select: false },

    // Is waqt se pehle ke login tokens ab nahi chalte (password reset ke baad)
    passwordChangedAt: { type: Date, select: false },
  },
  { timestamps: true }
);

// Save se pehle password hash karo
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Login ke waqt password match karna
userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export default model<IUser>("User", userSchema);