import { z } from "zod";
import { phone } from "./auth.validator";

const optionalText = (label: string, max: number) =>
  z.string(`${label} must be text.`).trim().max(max, `${label} is too long.`).optional();

const item = z.object({
  slug: z.string("Invalid dish.").trim().min(1, "Invalid dish.").max(80, "Invalid dish."),
  quantity: z
    .number("Quantity must be a number.")
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(20, "You can order up to 20 of one dish."),
});

export const createOrderSchema = z
  .object({
    items: z
      .array(item, "Your cart is empty.")
      .min(1, "Your cart is empty.")
      .max(30, "Too many different dishes in one order.")
      .refine((items) => new Set(items.map((i) => i.slug)).size === items.length, "Each dish should appear once."),
    // Jo total customer ne dekha. Server ka total alag ho to order nahi banta
    expectedTotal: z.number("Total is required.").int("Total is required.").min(0, "Total is required."),
    name: z.string("Name is required.").trim().min(1, "Name is required.").max(80, "Name is too long."),
    phone,
    deliveryType: z.enum(["hotel", "car", "other"], "Choose a delivery type."),
    hotel: optionalText("Hotel", 100),
    room: optionalText("Room", 30),
    location: optionalText("Location", 150),
    landmark: optionalText("Landmark", 150),
    carDetails: optionalText("Car details", 100),
    area: z.string("Please select your area.").trim().min(1, "Please select your area.").max(60, "Area is too long."),
    instructions: optionalText("Instructions", 300),
    paymentMethod: z.literal("Cash on Delivery", "Only Cash on Delivery is available right now."),
  })
  .superRefine((order, ctx) => {
    if (order.deliveryType === "hotel" && !order.hotel)
      ctx.addIssue({ code: "custom", path: ["hotel"], message: "Please select your hotel or guest house." });
    if (order.deliveryType !== "hotel" && !order.location)
      ctx.addIssue({ code: "custom", path: ["location"], message: "Please tell us where to deliver." });
  });

export const orderNumberSchema = z.object({
  orderNumber: z.string().regex(/^MF-\d{5,}$/, "Order not found."),
});
