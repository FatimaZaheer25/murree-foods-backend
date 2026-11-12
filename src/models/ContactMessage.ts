import { Schema, model, Document, Types } from "mongoose";

export const MESSAGE_STATUSES = ["new", "resolved"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

// Help & Contact form ka paigham. Admin "Messages" tab mein dekhta aur Resolved karta hai
export interface IContactMessage extends Document {
  name: string;
  email: string; // jawab isi par (email ka Reply-To bhi yahi)
  orderNumber?: string; // customer ne likha ho to (MF-10001)
  message: string;
  user?: Types.ObjectId; // login tha to kaun sa account
  status: MessageStatus;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  createdAt: Date;
}

const contactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    orderNumber: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: MESSAGE_STATUSES, default: "new" },
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Tab (New/Resolved) ke hisaab se, naye pehle
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ createdAt: -1 });

export default model<IContactMessage>("ContactMessage", contactMessageSchema);
