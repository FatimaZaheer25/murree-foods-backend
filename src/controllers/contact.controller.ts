import { Request, Response } from "express";
import ContactMessage, { IContactMessage } from "../models/ContactMessage";
import { AuthRequest } from "../middleware/auth.middleware";
import { sendEmail } from "../utils/sendEmail";
import { escapeHtml } from "../utils/text";

const PAGE_SIZE = 20;

type PopulatedMessage = Omit<IContactMessage, "resolvedBy"> & { resolvedBy?: { name: string } | null };

const adminMessage = (message: PopulatedMessage) => ({
  id: message._id,
  name: message.name,
  email: message.email,
  orderNumber: message.orderNumber ?? null,
  message: message.message,
  registered: Boolean(message.user), // login kar ke bheja tha
  status: message.status,
  createdAt: message.createdAt,
  resolvedAt: message.resolvedAt ?? null,
  resolvedBy: message.resolvedBy?.name ?? null,
});

// ================= PUBLIC =================
// Pehle database mein (kuch bhi ho, paigham gum na ho), phir admin ko email.
// Email ka intezar nahi: Gmail dheema ho to bhi customer ko foran jawab
export const createContactMessage = async (req: AuthRequest, res: Response) => {
  const { name, email, orderNumber, message } = req.body;
  const saved = await ContactMessage.create({ name, email, orderNumber, message, user: req.user?._id });

  const inbox = process.env.CONTACT_INBOX || (process.env.EMAIL_USER as string);
  const html = `
    <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) sent a message from the Help &amp; Contact page.</p>
    ${orderNumber ? `<p>Order: <strong>${escapeHtml(orderNumber)}</strong></p>` : ""}
    <p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">${escapeHtml(message)}</p>
    <p>Reply to this email to answer ${escapeHtml(name)}. Mark it resolved in Admin → Messages.</p>`;
  sendEmail(inbox, `New message from ${name}${orderNumber ? ` (${orderNumber})` : ""}`, html, email).catch(() =>
    console.log(`Contact email could not be sent (message ${String(saved._id)}). It is saved in Admin → Messages.`)
  );

  res.status(201).json({ success: true, message: "Thanks! Your message has been sent. We'll reply by email soon." });
};

// ================= ADMIN =================
export const listMessages = async (req: Request, res: Response) => {
  const { status, page } = res.locals.query as { status: "new" | "resolved" | "all"; page: number };
  const filter = status === "all" ? {} : { status };

  const [messages, total, counts] = await Promise.all([
    ContactMessage.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate<{ resolvedBy: { name: string } | null }>("resolvedBy", "name"),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const countOf = (name: string) => counts.find((row) => row._id === name)?.count ?? 0;
  res.status(200).json({
    success: true,
    messages: messages.map((message) => adminMessage(message as unknown as PopulatedMessage)),
    counts: { new: countOf("new"), resolved: countOf("resolved"), all: countOf("new") + countOf("resolved") },
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
};

// Resolved ya wapas New. Do admin ek saath karein to bhi aakhri haalat sahi
export const updateMessage = async (req: AuthRequest, res: Response) => {
  const { resolved } = req.body as { resolved: boolean };
  const update = resolved
    ? { $set: { status: "resolved" as const, resolvedAt: new Date(), resolvedBy: req.user!._id } }
    : { $set: { status: "new" as const }, $unset: { resolvedAt: 1 as const, resolvedBy: 1 as const } };

  const message = await ContactMessage.findByIdAndUpdate(String(req.params.id), update, {
    returnDocument: "after",
  }).populate<{ resolvedBy: { name: string } | null }>("resolvedBy", "name");

  if (!message) {
    res.status(404).json({ success: false, message: "Message not found." });
    return;
  }
  res.status(200).json({
    success: true,
    message: resolved ? "Marked as resolved." : "Moved back to New.",
    contactMessage: adminMessage(message as unknown as PopulatedMessage),
  });
};
