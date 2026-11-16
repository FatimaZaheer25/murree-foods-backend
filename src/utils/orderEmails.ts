import { IOrder } from "../models/Order";
import User from "../models/User";
import { sendEmail } from "./sendEmail";
import { escapeHtml } from "./text";

// Customer ko order ki khabar: lag gaya, pahunch gaya, cancel ho gaya.
// Email na ja sake to order par koi asar nahi (sirf log), is liye hamesha "void sendOrderEmail(...)"

export type OrderEmailKind = "placed" | "delivered" | "cancelled";

// Website ka address: CLIENT_URL ki pehli value (website, admin, rider is tarteeb mein)
const siteUrl = () => process.env.CLIENT_URL?.split(",")[0]?.trim().replace(/\/$/, "") ?? "";

const rs = (amount: number) => `Rs. ${amount.toLocaleString("en-US")}`;

const button = (href: string, text: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#1b4332;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${text}</a></p>`;

function itemsTable(order: IOrder) {
  const row = (left: string, right: string, bold = false) =>
    `<tr><td style="padding:6px 0;${bold ? "font-weight:700" : ""}">${left}</td><td style="padding:6px 0;text-align:right;${bold ? "font-weight:700" : ""}">${right}</td></tr>`;
  return `<table style="width:100%;max-width:480px;border-collapse:collapse;font-size:14px">
    ${order.items.map((item) => row(`${item.quantity} × ${escapeHtml(item.name)}`, rs(item.price * item.quantity))).join("")}
    <tr><td colspan="2" style="border-top:1px solid #e2d6c4"></td></tr>
    ${row("Delivery fee", order.deliveryFee ? rs(order.deliveryFee) : "Free")}
    ${row("Service fee", rs(order.serviceFee))}
    ${row("Total (Cash on Delivery)", rs(order.total), true)}
  </table>`;
}

export function orderEmail(order: IOrder, kind: OrderEmailKind, name: string) {
  const no = order.orderNumber;
  const link = siteUrl() ? `${siteUrl()}/tracking/${no}` : "";
  const hello = `<h2 style="font-family:Georgia,serif;color:#1b4332">Hello ${escapeHtml(name.split(" ")[0])},</h2>`;
  const where = `<p style="color:#555"><strong>Deliver to:</strong> ${escapeHtml(order.location)}, ${escapeHtml(order.delivery.area)}</p>`;

  if (kind === "placed") {
    return {
      subject: `Order ${no} confirmed — Murree Foods`,
      html: `${hello}<p>Thank you! We have received your order <strong>${no}</strong> and the kitchen will start on it soon.</p>
        ${itemsTable(order)}${where}
        ${link ? button(link, "Track your order") : ""}
        <p style="color:#777;font-size:13px">You can cancel from the tracking page until the kitchen starts preparing your food.</p>`,
    };
  }
  if (kind === "delivered") {
    return {
      subject: `Order ${no} delivered — enjoy your meal!`,
      html: `${hello}<p>Your order <strong>${no}</strong> has been delivered. We hope you enjoy it!</p>
        ${itemsTable(order)}
        ${link ? button(link, "Rate your order") : ""}
        <p style="color:#777;font-size:13px">Your rating helps other visitors to Murree choose their food.</p>`,
    };
  }
  return {
    subject: `Order ${no} cancelled`,
    html: `${hello}<p>Your order <strong>${no}</strong> has been cancelled.</p>
      ${order.cancelReason ? `<p><strong>Reason:</strong> ${escapeHtml(order.cancelReason)}</p>` : ""}
      <p>Nothing was charged, because payment is Cash on Delivery.</p>
      ${link ? button(link, "See order") : ""}`,
  };
}

export async function sendOrderEmail(order: IOrder, kind: OrderEmailKind) {
  try {
    const user = await User.findById(order.user).select("email name");
    if (!user?.email) return;
    const mail = orderEmail(order, kind, user.name || order.customerName);
    await sendEmail(user.email, mail.subject, mail.html);
  } catch {
    console.log(`Order ${kind} email could not be sent (${order.orderNumber}).`);
  }
}
