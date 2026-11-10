import { Schema, model, Document } from "mongoose";

export interface IHotel extends Document {
  name: string;
  area: string;
  landmark: string;
  isActive: boolean; // false: customer ki dropdown mein nahi aata
}

const hotelSchema = new Schema<IHotel>(
  {
    name: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },
    landmark: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hotelSchema.index({ name: 1, area: 1 }, { unique: true });

export default model<IHotel>("Hotel", hotelSchema);
