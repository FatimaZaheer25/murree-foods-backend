import { Schema, model, Document, Types } from "mongoose";

export const ORDER_STATUSES = ["Confirmed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Order ki "tasveer" (snapshot): us waqt ka naam, qeemat aur fees.
// Baad mein menu ya fees badlen to purana order nahi badalta
export interface IOrder extends Document {
  orderNumber: string; // MF-10001
  user: Types.ObjectId;
  items: { food: Types.ObjectId; slug: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  customerName: string;
  phone: string;
  delivery: {
    type: "hotel" | "car" | "other";
    hotel?: string;
    room?: string;
    location?: string;
    landmark?: string;
    carDetails?: string;
    area: string;
    instructions?: string;
  };
  location: string; // ek line mein, jaise "Pine View Guest House · Room 8"
  paymentMethod: "Cash on Delivery";
  status: OrderStatus;
  cancelReason?: string; // admin ki likhi wajah, customer ko dikhti hai
  cancelledBy?: "admin" | "customer";
  // Deliver hone ke baad customer ki rating (ek dafa)
  review?: { stars: number; comment?: string; at: Date };
  deliveredAt?: Date; // cash isi waqt aata hai (revenue ka din)
  cancelledAt?: Date;
  statusHistory: { status: OrderStatus; at: Date; by?: Types.ObjectId }[]; // by: jis admin ya rider ne badla
  // Rider (Module 7). riderInfo us waqt ki tasveer: customer ko naam/gaari, rider ka phone sirf raste mein
  rider?: Types.ObjectId;
  riderInfo?: { name: string; phone: string; vehicleType: string };
  assignedAt?: Date;
  pickedUpAt?: Date; // rider ne "Start Delivery" dabaya
  riderPay?: number; // deliver hote waqt Settings ki raqam (baad mein Settings badle to purani kamai na badle)
  riderSawCancel?: boolean; // rider ko "order cancel ho gaya" ek dafa dikh chuka
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [
      {
        _id: false,
        food: { type: Schema.Types.ObjectId, ref: "Food", required: true },
        slug: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    serviceFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    delivery: {
      type: { type: String, enum: ["hotel", "car", "other"], required: true },
      hotel: String,
      room: String,
      location: String,
      landmark: String,
      carDetails: String,
      area: { type: String, required: true },
      instructions: String,
    },
    location: { type: String, required: true },
    paymentMethod: { type: String, enum: ["Cash on Delivery"], default: "Cash on Delivery" },
    status: { type: String, enum: ORDER_STATUSES, default: "Confirmed", index: true },
    cancelReason: { type: String, trim: true },
    cancelledBy: { type: String, enum: ["admin", "customer"] },
    review: {
      type: new Schema({ stars: { type: Number, min: 1, max: 5, required: true }, comment: { type: String, trim: true }, at: Date }, { _id: false }),
      default: undefined,
    },
    deliveredAt: { type: Date, index: true },
    cancelledAt: Date,
    statusHistory: [
      { _id: false, status: { type: String, enum: ORDER_STATUSES }, at: Date, by: { type: Schema.Types.ObjectId, ref: "User" } },
    ],
    rider: { type: Schema.Types.ObjectId, ref: "User", index: true },
    riderInfo: { _id: false, name: String, phone: String, vehicleType: String },
    assignedAt: Date,
    pickedUpAt: Date,
    riderPay: { type: Number, min: 0 },
    riderSawCancel: Boolean,
  },
  { timestamps: true }
);

// Admin ki list: naye orders pehle
orderSchema.index({ createdAt: -1 });

export default model<IOrder>("Order", orderSchema);
