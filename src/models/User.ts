import { Schema, model, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

export const VEHICLE_TYPES = ["Bike", "Motorcycle", "Scooter", "Car"] as const;
export const RIDER_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

// Rider ki maloomat. CNIC jaan boojh kar yahan nahi: woh kabhi server tak aata hi nahi
export interface IRiderInfo {
  vehicleType: (typeof VEHICLE_TYPES)[number];
  registration: string;
  status: RiderStatus;
  reason?: string; // reject ya suspend ki wajah, rider ko dikhti hai
  statusChangedAt?: Date;
  statusChangedBy?: Types.ObjectId;
  online: boolean; // rider ne khud Online kiya (10 minute heartbeat na aaye to khud Offline)
  lastSeenAt?: Date; // panel khula ho to har minute heartbeat
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "customer" | "admin" | "rider";
  rider?: IRiderInfo; // sirf role "rider" par
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
    role: { type: String, enum: ["customer", "admin", "rider"], default: "customer" },
    rider: {
      type: new Schema<IRiderInfo>(
        {
          vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
          registration: { type: String, required: true, trim: true, uppercase: true },
          status: { type: String, enum: RIDER_STATUSES, default: "pending" },
          reason: { type: String, trim: true },
          statusChangedAt: Date,
          statusChangedBy: { type: Schema.Types.ObjectId, ref: "User" },
          online: { type: Boolean, default: false },
          lastSeenAt: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
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

// Rider login phone se bhi hota hai: ek phone ek hi rider ka (customers par ye shart nahi)
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { role: "rider" } });

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