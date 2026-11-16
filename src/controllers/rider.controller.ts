import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { Types } from "mongoose";
import Order, { IOrder, OrderStatus } from "../models/Order";
import { getSettings } from "../models/Setting";
import User from "../models/User";
import { sendOrderEmail } from "../utils/orderEmails";
import { pkDayStart } from "../utils/pkTime";
import { ACTIVE_DELIVERY, activeDeliveryOf, isOnline, ONLINE_WINDOW_MS } from "../utils/riderPresence";

const PAGE_SIZE = 20;
const WAITING: OrderStatus[] = ["Confirmed", "Preparing"]; // kitchen mein: rider le sakta / chhor sakta hai

const TYPE_LABEL = { hotel: "Hotel / Guest House", car: "Car / Current Location", other: "Other Location" } as const;

// ================= GUARD =================
// Sirf approved rider (pending/rejected/suspended ko panel hi nahi milta)
export const requireApprovedRider = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.rider?.status !== "approved") {
    res.status(403).json({ success: false, message: "Your rider account is not approved." });
    return;
  }
  next();
};

// ================= SHAPES =================
// Lene se pehle: customer ka phone nahi, sirf kahan aur kitna
const availableOrder = (order: IOrder) => ({
  id: order.orderNumber,
  placedAt: order.createdAt.toISOString(),
  status: order.status,
  customer: order.customerName,
  location: order.location,
  area: order.delivery.area,
  type: TYPE_LABEL[order.delivery.type],
  items: order.items.reduce((sum, item) => sum + item.quantity, 0),
  amount: order.total,
});

// Li hui delivery: sab kuch jo rider ko chahiye
const activeDelivery = (order: IOrder) => {
  const d = order.delivery;
  const place = d.type === "hotel" ? d.hotel : d.location;
  const details = (d.type === "hotel" ? [d.room && `Room ${d.room}`, d.landmark] : [d.landmark, d.type === "car" && d.carDetails]).filter(Boolean).join(" · ");
  return {
    id: order.orderNumber,
    status: order.status,
    customer: order.customerName,
    phone: order.phone,
    type: TYPE_LABEL[d.type],
    place: place ?? order.location,
    details,
    area: d.area,
    instructions: d.instructions || "",
    items: order.items.map(({ name, quantity }) => ({ name, quantity })),
    total: order.total,
    paymentMethod: order.paymentMethod,
    assignedAt: order.assignedAt?.toISOString(),
    pickedUpAt: order.pickedUpAt?.toISOString(),
  };
};

const deliveryRow = (order: IOrder) => ({
  id: order.orderNumber,
  customer: order.customerName,
  location: order.location,
  type: TYPE_LABEL[order.delivery.type],
  amount: order.total,
  status: order.status,
  time: (order.deliveredAt ?? order.cancelledAt ?? order.pickedUpAt ?? order.assignedAt ?? order.createdAt).toISOString(),
  riderPay: order.riderPay ?? 0,
});

// Kitne deliver kiye, kitna kamaya, kitna cash liya (from se ab tak)
async function earningsSince(riderId: Types.ObjectId, from: Date) {
  const [row] = await Order.aggregate<{ completed: number; earnings: number; cash: number }>([
    { $match: { rider: riderId, status: "Delivered", deliveredAt: { $gte: from } } },
    { $group: { _id: null, completed: { $sum: 1 }, earnings: { $sum: { $ifNull: ["$riderPay", 0] } }, cash: { $sum: "$total" } } },
  ]);
  return { completed: row?.completed ?? 0, earnings: row?.earnings ?? 0, cash: row?.cash ?? 0 };
}

// ================= SUMMARY (dashboard, earnings, active card) =================
export const getSummary = async (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const todayStart = pkDayStart(0);

  const [active, today, week, assignedToday, settings] = await Promise.all([
    activeDeliveryOf(me._id as Types.ObjectId),
    earningsSince(me._id as Types.ObjectId, todayStart),
    earningsSince(me._id as Types.ObjectId, pkDayStart(6)),
    Order.countDocuments({ rider: me._id as Types.ObjectId, assignedAt: { $gte: todayStart } }),
    getSettings(),
  ]);

  // Admin ne meri li hui delivery cancel kar di: ek dafa batao
  let notice: { id: string; reason: string } | null = null;
  if (!active) {
    const cancelled = await Order.findOneAndUpdate(
      { rider: me._id as Types.ObjectId, status: "Cancelled", riderSawCancel: { $ne: true } },
      { $set: { riderSawCancel: true } },
      { sort: { cancelledAt: -1 } }
    );
    if (cancelled) notice = { id: cancelled.orderNumber, reason: cancelled.cancelReason ?? "" };
  }

  res.status(200).json({
    success: true,
    online: isOnline(me),
    payPerDelivery: settings.riderPayPerDelivery,
    today: { assigned: assignedToday, ...today },
    week,
    active: active ? activeDelivery(active) : null,
    notice,
  });
};

// ================= ONLINE / OFFLINE =================
// Panel har minute bhejta hai. 10 minute ke baad aaya to pehle hi Offline ho chuka: dobara khud Online karna hoga
export const heartbeat = async (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const stale = !me.rider!.lastSeenAt || me.rider!.lastSeenAt.getTime() < Date.now() - ONLINE_WINDOW_MS;
  const online = me.rider!.online && !stale;

  await User.updateOne({ _id: me._id as Types.ObjectId }, { $set: { "rider.lastSeenAt": new Date(), "rider.online": online } });

  res.status(200).json({ success: true, online });
};

export const setOnline = async (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const online: boolean = req.body.online;

  if (!online) {
    const active = await activeDeliveryOf(me._id as Types.ObjectId);
    if (active) {
      res.status(409).json({ success: false, message: `Finish your active delivery (${active.orderNumber}) before going offline.` });
      return;
    }
  }

  await User.updateOne({ _id: me._id as Types.ObjectId }, { $set: { "rider.online": online, "rider.lastSeenAt": new Date() } });
  res.status(200).json({ success: true, message: online ? "You are online." : "You are offline.", online });
};

// ================= AVAILABLE ORDERS =================
// Kitchen mein orders jin par abhi koi rider nahi. Sirf online rider ko
export const listAvailable = async (req: AuthRequest, res: Response) => {
  if (!isOnline(req.user!)) {
    res.status(200).json({ success: true, online: false, orders: [] });
    return;
  }
  const orders = await Order.find({ status: { $in: WAITING }, rider: { $exists: false } })
    .sort({ createdAt: 1 })
    .limit(50);

  res.status(200).json({ success: true, online: true, orders: orders.map(availableOrder) });
};

// Jo pehle Accept kare, order us ka. Ek rider ke paas ek waqt mein ek hi delivery
export const acceptOrder = async (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const orderNumber = String(req.params.orderNumber);

  if (!isOnline(me)) {
    res.status(409).json({ success: false, message: "Go online to accept orders." });
    return;
  }
  const current = await activeDeliveryOf(me._id as Types.ObjectId);
  if (current) {
    res.status(409).json({ success: false, message: `You already have an active delivery (${current.orderNumber}).` });
    return;
  }

  const order = await Order.findOneAndUpdate(
    { orderNumber, status: { $in: WAITING }, rider: { $exists: false } },
    {
      $set: {
        rider: me._id as Types.ObjectId,
        riderInfo: { name: me.name, phone: me.phone ?? "", vehicleType: me.rider!.vehicleType },
        assignedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!order) {
    const exists = await Order.findOne({ orderNumber }).select("status rider");
    const message = !exists
      ? "Order not found."
      : exists.status === "Cancelled"
        ? "This order was cancelled."
        : exists.rider
          ? "This order was just taken by another rider."
          : "This order is no longer available.";
    res.status(exists ? 409 : 404).json({ success: false, message });
    return;
  }

  // Ek hi waqt do alag orders accept (do tabs): dono requests ek hi tarteeb dekhti hain,
  // pehle wala order rehta hai aur baaki wapas Available mein
  const mine = await Order.find({ rider: me._id as Types.ObjectId, status: { $in: ACTIVE_DELIVERY } })
    .sort({ assignedAt: 1, _id: 1 })
    .select("_id");
  if (mine.length > 1 && String(mine[0]._id) !== String(order._id)) {
    await Order.updateOne({ _id: order._id, rider: me._id as Types.ObjectId }, { $unset: { rider: "", riderInfo: "", assignedAt: "" } });
    res.status(409).json({ success: false, message: "You already have an active delivery." });
    return;
  }

  res.status(200).json({ success: true, message: "Delivery accepted.", delivery: activeDelivery(order) });
};

// Rider ke apne order par kaam (release / start / deliver): shart filter mein, taa ke ek saath do kaam na hon
async function myOrderAction(
  req: AuthRequest,
  res: Response,
  from: OrderStatus[],
  update: (order: IOrder) => Promise<Record<string, unknown>> | Record<string, unknown>,
  message: string,
  after?: (order: IOrder) => void // kaam ho jane ke baad (jaise customer ko email)
) {
  const me = req.user!;
  const orderNumber = String(req.params.orderNumber);

  const current = await Order.findOne({ orderNumber, rider: me._id as Types.ObjectId });
  if (!current) {
    res.status(404).json({ success: false, message: "This delivery is not assigned to you." });
    return;
  }
  if (!from.includes(current.status)) {
    const message =
      current.status === "Cancelled"
        ? "This order was cancelled."
        : current.status === "Delivered"
          ? "This order is already delivered."
          : "You cannot do this now. Please refresh.";
    res.status(409).json({ success: false, message });
    return;
  }

  const order = await Order.findOneAndUpdate({ _id: current._id, rider: me._id as Types.ObjectId, status: { $in: from } }, await update(current), {
    returnDocument: "after",
  });
  if (!order) {
    res.status(409).json({ success: false, message: "This order just changed. Please refresh." });
    return;
  }
  after?.(order);
  res.status(200).json({ success: true, message, delivery: order.rider ? activeDelivery(order) : null });
}

// Start se pehle chhor sakta hai: order wapas Available mein
export const releaseOrder = (req: AuthRequest, res: Response) =>
  myOrderAction(req, res, WAITING, () => ({ $unset: { rider: "", riderInfo: "", assignedAt: "" } }), "Delivery released.");

export const startDelivery = (req: AuthRequest, res: Response) =>
  myOrderAction(
    req,
    res,
    WAITING,
    () => ({
      $set: { status: "Out for Delivery", pickedUpAt: new Date() },
      $push: { statusHistory: { status: "Out for Delivery", at: new Date(), by: req.user!._id } },
    }),
    "Delivery started."
  );

export const markDelivered = (req: AuthRequest, res: Response) =>
  myOrderAction(
    req,
    res,
    ["Out for Delivery"],
    async () => {
      const { riderPayPerDelivery } = await getSettings();
      return {
        $set: { status: "Delivered", deliveredAt: new Date(), riderPay: riderPayPerDelivery },
        $push: { statusHistory: { status: "Delivered", at: new Date(), by: req.user!._id } },
      };
    },
    "Marked as delivered.",
    (order) => void sendOrderEmail(order, "delivered")
  );

// ================= MY DELIVERIES / HISTORY =================
const RANGE_DAYS = { today: 1, "7": 7, "30": 30 } as const;

export const listMyDeliveries = async (req: AuthRequest, res: Response) => {
  const { range, page } = res.locals.query as { range: keyof typeof RANGE_DAYS; page: number };
  const filter = { rider: req.user!._id, assignedAt: { $gte: pkDayStart(RANGE_DAYS[range] - 1) } };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ assignedAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    deliveries: orders.map(deliveryRow),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
};
