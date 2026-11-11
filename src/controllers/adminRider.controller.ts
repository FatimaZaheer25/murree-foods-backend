import { Request, Response } from "express";
import { Types } from "mongoose";
import { AuthRequest } from "../middleware/auth.middleware";
import Order from "../models/Order";
import User, { IUser, RiderStatus } from "../models/User";
import { pkDayStart } from "../utils/pkTime";
import { ACTIVE_DELIVERY, activeDeliveryOf, isOnline } from "../utils/riderPresence";
import { sendEmail } from "../utils/sendEmail";
import { escapeHtml, escapeRegex } from "../utils/text";

const PAGE_SIZE = 20;
const PHONE_TAKEN = "This phone number is already used by another rider.";

// Har action kis status se chal sakta hai, aur kis status par le jata hai.
// approve: pending se, ya rejected se (galti se reject hua ho). Rider khud dobara apply nahi kar sakta
const ACTIONS = {
  approve: { from: ["pending", "rejected"], to: "approved", message: "Rider approved." },
  reject: { from: ["pending"], to: "rejected", message: "Rider rejected." },
  suspend: { from: ["approved"], to: "suspended", message: "Rider suspended." },
  reactivate: { from: ["suspended"], to: "approved", message: "Rider reactivated." },
} as const satisfies Record<string, { from: RiderStatus[]; to: RiderStatus; message: string }>;

type Action = keyof typeof ACTIONS;

// Sirf verified riders (email OTP ho chuka). Adhoore signup admin ko nahi dikhte
const BASE = { role: "rider", isVerified: true } as const;

type Extra = { deliveriesToday: number; activeOrder: string | null };

const adminRider = (user: IUser, extra: Extra = { deliveriesToday: 0, activeOrder: null }) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  phone: user.phone ?? "",
  vehicleType: user.rider!.vehicleType,
  registration: user.rider!.registration,
  status: user.rider!.status,
  reason: ["rejected", "suspended"].includes(user.rider!.status) ? user.rider!.reason : undefined,
  joined: (user as unknown as { createdAt: Date }).createdAt.toISOString(),
  statusChangedAt: user.rider!.statusChangedAt?.toISOString(),
  online: isOnline(user),
  activeOrder: extra.activeOrder, // chal rahi delivery ka order number
  deliveriesToday: extra.deliveriesToday,
  rating: null, // Ratings abhi nahi: "—"
});

// Riders ki aaj ki deliveries aur chal rahi delivery (ek hi dafa sab ke liye)
async function extrasFor(ids: Types.ObjectId[]) {
  const [delivered, active] = await Promise.all([
    Order.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { rider: { $in: ids }, status: "Delivered", deliveredAt: { $gte: pkDayStart(0) } } },
      { $group: { _id: "$rider", count: { $sum: 1 } } },
    ]),
    Order.find({ rider: { $in: ids }, status: { $in: ACTIVE_DELIVERY } }).select("rider orderNumber"),
  ]);
  return (id: Types.ObjectId): Extra => ({
    deliveriesToday: delivered.find((row) => String(row._id) === String(id))?.count ?? 0,
    activeOrder: active.find((order) => String(order.rider) === String(id))?.orderNumber ?? null,
  });
}

// Approve/reject par rider ko email. Email na ja sake to bhi admin ka kaam ho chuka (sirf log)
async function notifyRider(user: IUser, action: Action) {
  const name = escapeHtml(user.name);
  const mail =
    action === "approve"
      ? {
          subject: "Your Murree Foods rider account is approved",
          html: `<h2>Welcome aboard, ${name}!</h2><p>Your rider account has been approved. You can now log in to the rider panel.</p>`,
        }
      : action === "reject"
        ? {
            subject: "Your Murree Foods rider application",
            html: `<h2>Hello ${name},</h2><p>Your rider application was not approved.</p><p><strong>Reason:</strong> ${escapeHtml(user.rider!.reason ?? "")}</p><p>If you think this is a mistake, please contact Murree Foods support.</p>`,
          }
        : null;
  if (!mail) return;
  try {
    await sendEmail(user.email, mail.subject, mail.html);
  } catch {
    console.log(`Rider ${action} email could not be sent (rider ${String(user._id)}).`);
  }
}

// ================= LIST =================
export const listRiders = async (req: Request, res: Response) => {
  const { status, q, page } = res.locals.query as { status: RiderStatus; q?: string; page: number };

  const search: Record<string, unknown> = { ...BASE };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    const or: Record<string, unknown>[] = [{ name: pattern }, { email: pattern }];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ phone: new RegExp(digits) });
    search.$or = or;
  }
  const filter = { ...search, "rider.status": status };

  const [riders, total, groups] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    User.countDocuments(filter),
    User.aggregate<{ _id: RiderStatus; count: number }>([{ $match: search }, { $group: { _id: "$rider.status", count: { $sum: 1 } } }]),
  ]);

  const countOf = (s: RiderStatus) => groups.find((group) => group._id === s)?.count ?? 0;
  const extra = await extrasFor(riders.map((rider) => rider._id as Types.ObjectId));

  res.status(200).json({
    success: true,
    riders: riders.map((rider) => adminRider(rider, extra(rider._id as Types.ObjectId))),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { pending: countOf("pending"), approved: countOf("approved"), suspended: countOf("suspended"), rejected: countOf("rejected") },
  });
};

// ================= APPROVE / REJECT / SUSPEND / REACTIVATE =================
// Shart filter mein: do admin ek saath badlen to bhi ghalat status se action nahi chalta
export const updateRiderStatus = async (req: AuthRequest, res: Response) => {
  const action = req.body.action as Action;
  const { from, to, message } = ACTIONS[action];

  // Delivery beech mein ho to suspend nahi: pehle order kisi aur rider ko do
  if (action === "suspend") {
    const busy = await activeDeliveryOf(new Types.ObjectId(String(req.params.id)));
    if (busy) {
      res.status(409).json({ success: false, message: `This rider has an active delivery (${busy.orderNumber}). Reassign it first.` });
      return;
    }
  }

  const rider = await User.findOneAndUpdate(
    { _id: String(req.params.id), ...BASE, "rider.status": { $in: from } },
    {
      $set: {
        "rider.status": to,
        "rider.statusChangedAt": new Date(),
        "rider.statusChangedBy": req.user!._id,
        // Wajah sirf reject/suspend par; approve/reactivate par purani wajah hat jati hai
        ...(req.body.reason && (action === "reject" || action === "suspend") ? { "rider.reason": req.body.reason } : {}),
        // Suspend: foran Offline
        ...(action === "suspend" ? { "rider.online": false } : {}),
      },
      ...(action === "approve" || action === "reactivate" ? { $unset: { "rider.reason": "" } } : {}),
    },
    { returnDocument: "after" }
  );

  if (!rider) {
    const current = await User.findOne({ _id: String(req.params.id), ...BASE }).select("rider.status");
    if (!current) {
      res.status(404).json({ success: false, message: "Rider not found." });
      return;
    }
    res.status(409).json({ success: false, message: `This rider is ${current.rider!.status}, so you cannot ${action} them.` });
    return;
  }

  await notifyRider(rider, action);

  res.status(200).json({ success: true, message, rider: adminRider(rider) });
};

// ================= EDIT =================
// Profile rider khud nahi badalta: phone, gaari ya naam admin badalta hai
export const updateRider = async (req: Request, res: Response) => {
  const { name, phone, vehicleType, registration } = req.body;

  if (phone && (await User.exists({ role: "rider", phone, _id: { $ne: String(req.params.id) } }))) {
    res.status(409).json({ success: false, message: PHONE_TAKEN });
    return;
  }

  const set: Record<string, unknown> = {};
  if (name !== undefined) set.name = name;
  if (phone !== undefined) set.phone = phone;
  if (vehicleType !== undefined) set["rider.vehicleType"] = vehicleType;
  if (registration !== undefined) set["rider.registration"] = registration;

  try {
    const rider = await User.findOneAndUpdate({ _id: String(req.params.id), ...BASE }, { $set: set }, { returnDocument: "after", runValidators: true });
    if (!rider) {
      res.status(404).json({ success: false, message: "Rider not found." });
      return;
    }
    res.status(200).json({ success: true, message: "Rider updated.", rider: adminRider(rider) });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    res.status(409).json({ success: false, message: PHONE_TAKEN });
  }
};

// ================= RIDER CHOICES (order Manage mein assign) =================
// Approved riders: online pehle, phir naam. Chal rahi delivery bhi saath (aise rider ko naya order nahi milta)
export const listRiderOptions = async (req: Request, res: Response) => {
  const riders = await User.find({ ...BASE, "rider.status": "approved" }).sort({ name: 1 }).limit(500);
  const extra = await extrasFor(riders.map((rider) => rider._id as Types.ObjectId));

  const options = riders
    .map((rider) => ({
      id: String(rider._id),
      name: rider.name,
      vehicleType: rider.rider!.vehicleType,
      online: isOnline(rider),
      activeOrder: extra(rider._id as Types.ObjectId).activeOrder,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online));

  res.status(200).json({ success: true, riders: options });
};
