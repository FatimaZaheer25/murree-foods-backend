import { Request, Response } from "express";
import Order from "../models/Order";
import User from "../models/User";
import { escapeRegex } from "../utils/text";
import { PK_TIMEZONE, pkDateKeys, pkDayStart } from "../utils/pkTime";

// Ginti ke qaayde (sab jagah ek jaise):
// - Orders: jo us din place hue, Cancelled ke ilawa
// - Revenue: sirf Delivered orders ka total, us din jab deliver hue (COD: paisa tabhi aata hai)
// - Cancelled kisi ginti ya revenue mein nahi
const ACTIVE = ["Confirmed", "Preparing", "Out for Delivery"];
const PAGE_SIZE = 20;

// Module 5 se pehle ke orders mein deliveredAt/cancelledAt nahi. Un ka aakhri badlav (updatedAt) wahi waqt hai,
// kyun ke Delivered/Cancelled ke baad order nahi badalta
const deliveredAt = { $ifNull: ["$deliveredAt", "$updatedAt"] };
const cancelledAt = { $ifNull: ["$cancelledAt", "$updatedAt"] };
const pkDay = (date: unknown) => ({ $dateToString: { format: "%Y-%m-%d", date, timezone: PK_TIMEZONE } });
const between = (from: Date, to: Date) => ({ $gte: from, $lt: to });

type Day = { date: string; orders: number; revenue: number; delivered: number };

// Har din ke orders aur revenue (khaali din 0 ke saath)
async function dailySeries(from: Date, to: Date, days: number): Promise<Day[]> {
  const [placed, delivered] = await Promise.all([
    Order.aggregate<{ _id: string; orders: number }>([
      { $match: { createdAt: between(from, to), status: { $ne: "Cancelled" } } },
      { $group: { _id: pkDay("$createdAt"), orders: { $sum: 1 } } },
    ]),
    Order.aggregate<{ _id: string; revenue: number; delivered: number }>([
      { $match: { status: "Delivered" } },
      { $addFields: { closedAt: deliveredAt } },
      { $match: { closedAt: between(from, to) } },
      { $group: { _id: pkDay("$closedAt"), revenue: { $sum: "$total" }, delivered: { $sum: 1 } } },
    ]),
  ]);

  const placedBy = new Map(placed.map((d) => [d._id, d.orders]));
  const deliveredBy = new Map(delivered.map((d) => [d._id, d]));
  return pkDateKeys(from, days).map((date) => ({
    date,
    orders: placedBy.get(date) ?? 0,
    revenue: deliveredBy.get(date)?.revenue ?? 0,
    delivered: deliveredBy.get(date)?.delivered ?? 0,
  }));
}

// Abhi chal rahe orders: kitne, aur kitna cash raste mein
async function activeOrders() {
  const [row] = await Order.aggregate<{ orders: number; amount: number }>([
    { $match: { status: { $in: ACTIVE } } },
    { $group: { _id: null, orders: { $sum: 1 }, amount: { $sum: "$total" } } },
  ]);
  return { orders: row?.orders ?? 0, amount: row?.amount ?? 0 };
}

// ================= DASHBOARD =================
export const getDashboardStats = async (req: Request, res: Response) => {
  const [week, active] = await Promise.all([dailySeries(pkDayStart(6), pkDayStart(-1), 7), activeOrders()]);
  const today = week[6];

  res.status(200).json({
    success: true,
    today: { date: today.date, orders: today.orders, revenue: today.revenue, delivered: today.delivered },
    yesterday: { orders: week[5].orders },
    active,
    week,
  });
};

// ================= ANALYTICS =================
export const getAnalytics = async (req: Request, res: Response) => {
  const { days } = res.locals.query as { days: number };
  const from = pkDayStart(days - 1);
  const to = pkDayStart(-1);

  const [daily, cancelled, topDishes, byArea] = await Promise.all([
    dailySeries(from, to, days),
    Order.countDocuments({ createdAt: between(from, to), status: "Cancelled" }),
    // Sab se zyada biki dishes (deliver hue orders se)
    Order.aggregate([
      { $match: { status: "Delivered" } },
      { $addFields: { closedAt: deliveredAt } },
      { $match: { closedAt: between(from, to) } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.slug",
          name: { $last: "$items.name" },
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { quantity: -1, revenue: -1, _id: 1 } },
      { $limit: 5 },
      { $project: { _id: 0, slug: "$_id", name: 1, quantity: 1, revenue: 1 } },
    ]),
    // Kis area se kitne orders (place hue, Cancelled ke ilawa) aur un mein se kitna deliver ho kar aaya
    Order.aggregate([
      { $match: { createdAt: between(from, to), status: { $ne: "Cancelled" } } },
      {
        $group: {
          _id: "$delivery.area",
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, "$total", 0] } },
        },
      },
      { $sort: { orders: -1, _id: 1 } },
      { $project: { _id: 0, area: "$_id", orders: 1, revenue: 1 } },
    ]),
  ]);

  const orders = daily.reduce((sum, d) => sum + d.orders, 0);
  const revenue = daily.reduce((sum, d) => sum + d.revenue, 0);
  const delivered = daily.reduce((sum, d) => sum + d.delivered, 0);

  res.status(200).json({
    success: true,
    days,
    totals: {
      orders,
      revenue,
      delivered,
      averageOrder: delivered ? Math.round(revenue / delivered) : 0,
      cancelled,
      // Place hue orders mein se kitne % cancel (ek decimal)
      cancelRate: orders + cancelled ? Math.round((cancelled / (orders + cancelled)) * 1000) / 10 : 0,
    },
    daily,
    topDishes,
    byArea,
  });
};

// ================= CUSTOMERS =================
// Sirf verified customer accounts (admin aur adhoore signup nahi). Naye pehle
export const listCustomers = async (req: Request, res: Response) => {
  const { q, page } = res.locals.query as { q?: string; page: number };

  const filter: Record<string, unknown> = { role: "customer", isVerified: true };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    const or: Record<string, unknown>[] = [{ name: pattern }, { email: pattern }];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ phone: new RegExp(digits) });
    filter.$or = or;
  }

  const [rows, total] = await Promise.all([
    User.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (page - 1) * PAGE_SIZE },
      { $limit: PAGE_SIZE },
      {
        $lookup: {
          from: "orders",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
            {
              $group: {
                _id: null,
                orders: { $sum: { $cond: [{ $ne: ["$status", "Cancelled"] }, 1, 0] } },
                spent: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, "$total", 0] } },
                lastOrder: { $max: "$createdAt" },
              },
            },
          ],
          as: "stats",
        },
      },
      { $project: { name: 1, email: 1, phone: 1, createdAt: 1, stats: { $first: "$stats" } } },
    ]),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    customers: rows.map((row) => ({
      id: String(row._id),
      name: row.name,
      email: row.email,
      phone: row.phone ?? "",
      orders: row.stats?.orders ?? 0,
      spent: row.stats?.spent ?? 0,
      lastOrder: row.stats?.lastOrder ? new Date(row.stats.lastOrder).toISOString() : null,
      joined: new Date(row.createdAt).toISOString(),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
};

// ================= PAYMENTS (sirf Cash on Delivery) =================
const RANGE_DAYS = { today: 1, "7": 7, "30": 30 } as const;

export const getPayments = async (req: Request, res: Response) => {
  const { range, page } = res.locals.query as { range: keyof typeof RANGE_DAYS; page: number };
  const from = pkDayStart(RANGE_DAYS[range] - 1);
  const to = pkDayStart(-1);

  const [[collected], [cancelledRow], pending] = await Promise.all([
    Order.aggregate([
      { $match: { status: "Delivered" } },
      { $addFields: { closedAt: deliveredAt } },
      { $match: { closedAt: between(from, to) } },
      {
        $facet: {
          summary: [{ $group: { _id: null, amount: { $sum: "$total" }, count: { $sum: 1 } } }],
          rows: [
            { $sort: { closedAt: -1, _id: -1 } },
            { $skip: (page - 1) * PAGE_SIZE },
            { $limit: PAGE_SIZE },
            { $project: { _id: 0, orderNumber: 1, closedAt: 1, customerName: 1, total: 1, paymentMethod: 1 } },
          ],
        },
      },
    ]),
    Order.aggregate([
      { $match: { status: "Cancelled" } },
      { $addFields: { closedAt: cancelledAt } },
      { $match: { closedAt: between(from, to) } },
      { $group: { _id: null, amount: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    activeOrders(),
  ]);

  const count = collected.summary[0]?.count ?? 0;

  res.status(200).json({
    success: true,
    range,
    summary: {
      collected: { amount: collected.summary[0]?.amount ?? 0, count },
      pending: { amount: pending.amount, count: pending.orders },
      cancelled: { amount: cancelledRow?.amount ?? 0, count: cancelledRow?.count ?? 0 },
    },
    payments: collected.rows.map((row: { orderNumber: string; closedAt: Date; customerName: string; total: number; paymentMethod: string }) => ({
      id: row.orderNumber,
      date: new Date(row.closedAt).toISOString(),
      customer: row.customerName,
      amount: row.total,
      method: row.paymentMethod,
    })),
    total: count,
    page,
    totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
  });
};
