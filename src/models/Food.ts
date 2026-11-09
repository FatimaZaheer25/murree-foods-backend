import { Schema, model, Document } from "mongoose";

export interface IFood extends Document {
  slug: string;
  name: string;
  category: string; // Category ka slug
  description: string;
  longDescription: string;
  price: number;
  time: number; // minutes
  rating: number;
  reviewCount: number;
  badge: string;
  image: string;
  gallery: string[];
  popular: boolean;
  vegetarian: boolean;
  spicy: boolean;
  isAvailable: boolean; // false: customer ko nahi dikhti
}

const foodSchema = new Schema<IFood>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, lowercase: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    longDescription: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    time: { type: Number, required: true, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    badge: { type: String, default: "", trim: true },
    image: { type: String, required: true, trim: true },
    gallery: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    vegetarian: { type: Boolean, default: false },
    spicy: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IFood>("Food", foodSchema);
