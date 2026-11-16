import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { nextSequence } from "../models/Counter";
import Food from "../models/Food";
import Hotel from "../models/Hotel";
import Order, { IOrder } from "../models/Order";
import { getSettings } from "../models/Setting";
import User from "../models/User";
import { sendOrderEmail } from "../utils/orderEmails";
import { storeStatus } from "../utils/storeHours";

// Frontend ko ye shakal jati hai (pehle wale localStorage orders jaisi)
export const toClientOrder = (order: IOrder) => ({
  id: order.orderNumber,
  date: order.createdAt.toISOString(),
  status: order.status,
  cancelReason: order.status === "Cancelled" ? order.cancelReason : undefined,
  cancelledBy: order.status === "Cancelled" ? order.cancelledBy : undefined,
  review: order.review ? { stars: order.review.stars, comment: order.review.comment || undefined, at: order.review.at.toISOString() } : undefined,
  items: order.items.map(({ slug, name, price, quantity }) => ({ slug, name, price, quantity })),
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee,
  serviceFee: order.serviceFee,
  total: order.total,
  customer: order.customerName,
  phone: order.phone,
  location: order.location,
  area: order.delivery.area,
  instructions: order.delivery.instructions || undefined,
  paymentMethod: order.paymentMethod,
  // Customer ko rider ka pehla naam aur gaari; phone sirf jab rider raste mein ho
  rider: order.riderInfo?.name ? order.riderInfo.name.split(" ")[0] : undefined,
  riderVehicle: order.riderInfo?.vehicleType || undefined,
  riderPhone: order.status === "Out for Delivery" ? order.riderInfo?.phone || undefined : undefined,
});

// Rider account se khana order nahi hota (customer account chahiye)
export const blockRiders = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user!.role === "rider") {
    res.status(403).json({ success: false, message: "Rider accounts can't place food orders. Please use a customer account." });
    return;
  }
  next();
};

// ================= PLACE ORDER =================
// Qeemat aur fees hamesha server par nikalti hain. Browser ka bheja hua total sirf mawazne ke liye hai
export const placeOrder = async (req: AuthRequest, res: Response) => {
  const { items, expectedTotal, name, phone, deliveryType, hotel, room, location, landmark, carDetails, area, instructions } =
    req.body;

  const settings = await getSettings();
  // Admin ne orders band kiye hain, ya auqaat ke bahar
  const store = storeStatus(settings);
  if (!store.open) {
    res.status(409).json({ success: false, message: store.message, closed: true });
    return;
  }
  if (!settings.areas.includes(area)) {
    res.status(400).json({ success: false, message: "Please select your area again." });
    return;
  }
  if (deliveryType === "hotel" && !(await Hotel.exists({ name: hotel, area, isActive: true }))) {
    res.status(400).json({ success: false, message: "This hotel is not available. Please select your stay again." });
    return;
  }

  const slugs: string[] = items.map((item: { slug: string }) => item.slug);
  const foods = await Food.find({ slug: { $in: slugs }, isAvailable: true });
  if (foods.length !== slugs.length) {
    res.status(409).json({ success: false, message: "Some dishes are no longer available. Please review your cart." });
    return;
  }

  const lines = items.map((item: { slug: string; quantity: number }) => {
    const food = foods.find((f) => f.slug === item.slug)!;
    return { food: food._id, slug: food.slug, name: food.name, price: food.price, quantity: item.quantity };
  });
  const subtotal = lines.reduce((sum: number, line: { price: number; quantity: number }) => sum + line.price * line.quantity, 0);
  if (subtotal < settings.minOrderAmount) {
    res.status(400).json({
      success: false,
      message: `The minimum order is Rs. ${settings.minOrderAmount.toLocaleString("en-US")} (food only). Please add a little more.`,
    });
    return;
  }
  const deliveryFee = subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFee;
  const serviceFee = settings.serviceFee;
  const total = subtotal + deliveryFee + serviceFee;

  // Customer ne cart mein kuch aur dekha tha: chupchap mehnga order nahi banana
  if (total !== expectedTotal) {
    res.status(409).json({ success: false, message: "Prices have changed. Please review your cart." });
    return;
  }

  const place =
    deliveryType === "hotel"
      ? [room ? `${hotel} · Room ${room}` : hotel]
      : [location, landmark, deliveryType === "car" ? carDetails : undefined];

  const order = await Order.create({
    orderNumber: `MF-${10000 + (await nextSequence("order"))}`,
    user: req.user!._id,
    items: lines,
    subtotal,
    deliveryFee,
    serviceFee,
    total,
    customerName: name,
    phone,
    delivery: { type: deliveryType, hotel, room, location, landmark, carDetails, area, instructions },
    location: place.filter(Boolean).join(" · "),
    statusHistory: [{ status: "Confirmed", at: new Date() }],
  });

  // Purane accounts (phone save hone se pehle bane) mein pehle order ka phone bhar do, taa ke agli dafa
  // Checkout par khud aa jaye. Shart filter mein hai: jo phone pehle se hai woh kabhi nahi badalta
  if (!req.user!.phone) {
    await User.updateOne(
      { _id: req.user!._id, $or: [{ phone: { $exists: false } }, { phone: "" }, { phone: null }] },
      { $set: { phone } }
    );
  }

  void sendOrderEmail(order, "placed");
  res.status(201).json({ success: true, message: "Order placed.", order: toClientOrder(order) });
};

// ================= CUSTOMER CANCEL =================
// Sirf apna order, aur sirf jab tak kitchen ne shuru nahi kiya (Confirmed). Us ke baad support se baat
export const cancelMyOrder = async (req: AuthRequest, res: Response) => {
  const orderNumber = String(req.params.orderNumber);
  const mine = { orderNumber, user: req.user!._id };

  const order = await Order.findOneAndUpdate(
    { ...mine, status: "Confirmed" },
    {
      $set: { status: "Cancelled", cancelReason: "Cancelled by the customer.", cancelledBy: "customer", cancelledAt: new Date() },
      $push: { statusHistory: { status: "Cancelled", at: new Date(), by: req.user!._id } },
    },
    { returnDocument: "after" }
  );

  if (!order) {
    const current = await Order.findOne(mine).select("status");
    if (!current) {
      res.status(404).json({ success: false, message: "Order not found." });
    } else if (current.status === "Cancelled") {
      res.status(409).json({ success: false, message: "This order is already cancelled." });
    } else if (current.status === "Delivered") {
      res.status(409).json({ success: false, message: "This order is already delivered." });
    } else {
      res.status(409).json({
        success: false,
        message: "The kitchen has already started on this order, so it can't be cancelled here. Please contact us.",
      });
    }
    return;
  }

  void sendOrderEmail(order, "cancelled");
  res.status(200).json({ success: true, message: "Order cancelled.", order: toClientOrder(order) });
};

// ================= RATING =================
// Deliver hone ke baad ek dafa: 1-5 sitare + (marzi se) do lafz. Order ki har dish ki rating bhi isi se badalti hai
export const reviewOrder = async (req: AuthRequest, res: Response) => {
  const orderNumber = String(req.params.orderNumber);
  const mine = { orderNumber, user: req.user!._id };
  const { stars, comment } = req.body as { stars: number; comment?: string };

  const order = await Order.findOneAndUpdate(
    { ...mine, status: "Delivered", review: { $exists: false } },
    { $set: { review: { stars, ...(comment ? { comment } : {}), at: new Date() } } },
    { returnDocument: "after" }
  );

  if (!order) {
    const current = await Order.findOne(mine).select("status review");
    if (!current) res.status(404).json({ success: false, message: "Order not found." });
    else if (current.review) res.status(409).json({ success: false, message: "You have already rated this order." });
    else res.status(409).json({ success: false, message: "You can rate your order after it is delivered." });
    return;
  }

  // Har dish ki nayi ausat: (purani ausat × ginti + naye sitare) / (ginti + 1), ek dashamlav tak.
  // Database khud hisaab karta hai, taa ke do ratings ek saath aayein to bhi koi gum na ho
  const foodIds = [...new Set(order.items.map((item) => String(item.food)))];
  await Food.updateMany(
    { _id: { $in: foodIds } },
    [
      {
        $set: {
          rating: {
            $round: [{ $divide: [{ $add: [{ $multiply: ["$rating", "$reviewCount"] }, stars] }, { $add: ["$reviewCount", 1] }] }, 1],
          },
          reviewCount: { $add: ["$reviewCount", 1] },
        },
      },
    ],
    { updatePipeline: true }
  );

  res.status(200).json({ success: true, message: "Thank you for your rating!", order: toClientOrder(order) });
};

// ================= MY ORDERS =================
export const listMyOrders = async (req: AuthRequest, res: Response) => {
  const orders = await Order.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(50);

  res.status(200).json({ success: true, orders: orders.map(toClientOrder) });
};

// ================= ONE ORDER (tracking) =================
// Sirf apna order (ya admin). Kisi aur ka ho to bhi "not found", taa ke pata na chale ke woh number mojood hai
export const getOrder = async (req: AuthRequest, res: Response) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  const allowed = order && (String(order.user) === String(req.user!._id) || req.user!.role === "admin");

  if (!order || !allowed) {
    res.status(404).json({ success: false, message: "Order not found." });
    return;
  }

  res.status(200).json({ success: true, order: toClientOrder(order) });
};
