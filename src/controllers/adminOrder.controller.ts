import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import Order, { IOrder, OrderStatus } from "../models/Order";
import { escapeRegex } from "../utils/text";
import { toClientOrder } from "./order.controller";

const PAGE_SIZE = 20;

// Status sirf aage jata hai, is tarteeb mein. Beech ka qadam chhor sakte hain, peeche nahi
const FLOW: OrderStatus[] = ["Confirmed", "Preparing", "Out for Delivery", "Delivered"];
const ACTIVE: OrderStatus[] = ["Confirmed", "Preparing", "Out for Delivery"];

const TABS = {
  all: {},
  active: { status: { $in: ACTIVE } },
  delivered: { status: "Delivered" },
  cancelled: { status: "Cancelled" },
} as const;

// Admin ko customer wali shakal + kab kya hua
const adminOrder = (order: IOrder) => ({
  ...toClientOrder(order),
  history: order.statusHistory.map(({ status, at }) => ({ status, at: at.toISOString() })),
});

// Update na hua: order hai hi nahi, ya pehle se aage/band hai
const explainConflict = async (orderNumber: string, res: Response, action: "status" | "cancel") => {
  const current = await Order.findOne({ orderNumber }).select("status");

  if (!current) {
    res.status(404).json({ success: false, message: "Order not found." });
  } else if (current.status === "Cancelled") {
    res.status(409).json({ success: false, message: "This order is cancelled and cannot be changed." });
  } else if (current.status === "Delivered") {
    const message = action === "cancel" ? "Delivered orders cannot be cancelled." : "This order is already delivered.";
    res.status(409).json({ success: false, message });
  } else {
    res.status(409).json({
      success: false,
      message: `This order is already ${current.status}. Status can only move forward.`,
    });
  }
};

// ================= LIST =================
export const listAdminOrders = async (req: Request, res: Response) => {
  const { status, q, page } = res.locals.query as { status: keyof typeof TABS; q?: string; page: number };

  // Search: order number, naam, ya phone (phone mein dash/space ho to bhi mile)
  const search: Record<string, unknown> = {};
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    const or: Record<string, unknown>[] = [{ orderNumber: pattern }, { customerName: pattern }];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ phone: new RegExp(digits) });
    search.$or = or;
  }
  const filter = { ...search, ...TABS[status] };

  const [orders, total, groups] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
    Order.aggregate<{ _id: OrderStatus; count: number }>([{ $match: search }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  // Tabs par ginti (search ke hisaab se)
  const countOf = (statuses: OrderStatus[]) =>
    groups.filter((group) => statuses.includes(group._id)).reduce((sum, group) => sum + group.count, 0);

  res.status(200).json({
    success: true,
    orders: orders.map(adminOrder),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: {
      all: countOf([...FLOW, "Cancelled"]),
      active: countOf(ACTIVE),
      delivered: countOf(["Delivered"]),
      cancelled: countOf(["Cancelled"]),
    },
  });
};

// ================= CHANGE STATUS =================
// Shart filter mein hai: do admin ek saath badlen to bhi status peeche nahi jata
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  const next: OrderStatus = req.body.status;
  const orderNumber = String(req.params.orderNumber);

  const order = await Order.findOneAndUpdate(
    { orderNumber, status: { $in: FLOW.slice(0, FLOW.indexOf(next)) } },
    { $set: { status: next }, $push: { statusHistory: { status: next, at: new Date(), by: req.user!._id } } },
    { returnDocument: "after" }
  );

  if (!order) return explainConflict(orderNumber, res, "status");

  res.status(200).json({ success: true, message: `Order marked as ${next}.`, order: adminOrder(order) });
};

// ================= CANCEL =================
// Delivered se pehle kabhi bhi, wajah ke saath. Cancel ke baad order band
export const cancelOrder = async (req: AuthRequest, res: Response) => {
  const orderNumber = String(req.params.orderNumber);

  const order = await Order.findOneAndUpdate(
    { orderNumber, status: { $in: ACTIVE } },
    {
      $set: { status: "Cancelled", cancelReason: req.body.reason },
      $push: { statusHistory: { status: "Cancelled", at: new Date(), by: req.user!._id } },
    },
    { returnDocument: "after" }
  );

  if (!order) return explainConflict(orderNumber, res, "cancel");

  res.status(200).json({ success: true, message: "Order cancelled.", order: adminOrder(order) });
};
