import { Types } from "mongoose";
import Order, { OrderStatus } from "../models/Order";
import User, { IUser } from "../models/User";

// Rider panel khula ho to har minute heartbeat bhejta hai. 10 minute koi heartbeat na aaye
// (app band, phone ki battery khatam) to rider khud Offline: admin ko jhoota "online" na dikhe
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export const ACTIVE_DELIVERY: OrderStatus[] = ["Confirmed", "Preparing", "Out for Delivery"];

const cutoff = () => new Date(Date.now() - ONLINE_WINDOW_MS);

// Sach mein online: khud Online kiya + 10 minute ke andar heartbeat aaya
export const isOnline = (user: IUser) =>
  !!user.rider?.online && !!user.rider.lastSeenAt && user.rider.lastSeenAt.getTime() >= Date.now() - ONLINE_WINDOW_MS;

// Database query ke liye wahi shart
export const onlineFilter = () => ({
  role: "rider" as const,
  isVerified: true,
  "rider.status": "approved" as const,
  "rider.online": true,
  "rider.lastSeenAt": { $gte: cutoff() },
});

// Har minute: jin ka heartbeat 10 minute se nahi aaya, unhein database mein bhi Offline kar do
export const sweepOfflineRiders = () =>
  User.updateMany(
    { role: "rider", "rider.online": true, $or: [{ "rider.lastSeenAt": { $lt: cutoff() } }, { "rider.lastSeenAt": { $exists: false } }] },
    { $set: { "rider.online": false } }
  );

export const startOfflineSweep = () => {
  const timer = setInterval(() => {
    sweepOfflineRiders().catch((error) => console.log("Rider offline sweep failed:", (error as Error).message));
  }, 60 * 1000);
  timer.unref(); // server band ho to ye timer use roke nahi
};

// Rider ki chal rahi delivery (ek waqt mein sirf ek)
export const activeDeliveryOf = (riderId: Types.ObjectId) =>
  Order.findOne({ rider: riderId, status: { $in: ACTIVE_DELIVERY } }).sort({ assignedAt: -1 });
