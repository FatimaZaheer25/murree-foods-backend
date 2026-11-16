import { Schema, model, Document } from "mongoose";

export interface ISetting extends Document {
  key: string;
  freeDeliveryThreshold: number; // itne ya zyada ke order par delivery free
  deliveryFee: number;
  serviceFee: number;
  riderPayPerDelivery: number;
  minOrderAmount: number; // khane (subtotal) ki kam az kam raqam. 0 = koi had nahi
  // Orders lena: band karne ka switch, aur roz ke auqaat (Pakistan time, "HH:MM"). Dono khali = 24 ghante
  acceptingOrders: boolean;
  openTime: string;
  closeTime: string;
  areas: string[];
  // Help & Contact page aur footer. Khali = woh option nahi dikhta
  contactWhatsapp: string;
  contactPhone: string;
  contactEmail: string;
  facebookUrl: string;
  instagramUrl: string;
}

const DEFAULT_AREAS = [
  "The Mall",
  "Kashmir Point",
  "Pindi Point",
  "Bhurban",
  "Jhika Gali",
  "Lower Topa",
  "Gharial",
  "Company Bagh",
  "Sunny Bank",
  "Kuldana",
];

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true }, // poori app ki sirf ek setting
    freeDeliveryThreshold: { type: Number, default: 1500, min: 0 },
    deliveryFee: { type: Number, default: 150, min: 0 },
    serviceFee: { type: Number, default: 50, min: 0 },
    riderPayPerDelivery: { type: Number, default: 120, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    acceptingOrders: { type: Boolean, default: true },
    openTime: { type: String, trim: true, default: "" },
    closeTime: { type: String, trim: true, default: "" },
    areas: { type: [String], default: DEFAULT_AREAS },
    contactWhatsapp: { type: String, trim: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    facebookUrl: { type: String, trim: true, default: "" },
    instagramUrl: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

const Setting = model<ISetting>("Setting", settingSchema);

// Hamesha ek hi setting. Na ho to default values se ban jati hai
export const getSettings = () =>
  Setting.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).orFail();

export default Setting;
