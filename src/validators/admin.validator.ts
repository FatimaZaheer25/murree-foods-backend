import { z } from "zod";
import { IMAGE_RULE, isAllowedImage } from "../config/imageHosts";
import { phone, registration, vehicleType } from "./auth.validator";

// ================= ORDERS =================
export const adminOrdersQuerySchema = z.object({
  status: z.enum(["all", "active", "delivered", "cancelled"], "Invalid status filter.").default("all"),
  q: z.string("Search must be text.").trim().max(60, "Search is too long.").optional(),
  page: z.coerce.number("Page must be a number.").int("Invalid page.").min(1, "Invalid page.").max(100000, "Invalid page.").default(1),
});

// Cancel alag route se hota hai (wajah ke saath), is liye yahan nahi
export const updateOrderStatusSchema = z.object({
  status: z.enum(["Preparing", "Out for Delivery", "Delivered"], "Choose a valid status."),
});

export const cancelOrderSchema = z.object({
  reason: z
    .string("Please write a reason for cancelling.")
    .trim()
    .min(5, "Please write a reason (at least 5 characters).")
    .max(200, "Reason is too long (200 characters max)."),
});

// ================= MENU =================
const text = (label: string, max: number) =>
  z.string(`${label} is required.`).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

const whole = (label: string, min: number, max: number) =>
  z
    .number(`${label} must be a number.`)
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} cannot be more than ${max.toLocaleString("en-US")}.`);

const photo = z.string("Photo is required.").trim().min(1, "Photo is required.").max(500, "Photo link is too long.").refine(isAllowedImage, IMAGE_RULE);

const flag = (label: string) => z.boolean(`${label} must be true or false.`);

const foodFields = {
  name: z.string("Dish name is required.").trim().min(2, "Dish name is too short.").max(80, "Dish name is too long."),
  category: text("Category", 60).toLowerCase(),
  description: text("Short description", 150),
  longDescription: text("Full description", 1000),
  price: whole("Price", 1, 100000),
  time: whole("Prep time", 1, 240),
  rating: z
    .number("Rating must be a number.")
    .min(0, "Rating must be between 0 and 5.")
    .max(5, "Rating must be between 0 and 5.")
    .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, "Rating can have one decimal, like 4.5."),
  reviewCount: whole("Reviews count", 0, 1000000),
  badge: z.string("Badge must be text.").trim().max(30, "Badge is too long."),
  image: photo,
  gallery: z
    .array(photo, "Gallery must be a list of photos.")
    .max(4, "You can add up to 4 extra photos.")
    .refine((photos) => new Set(photos).size === photos.length, "Gallery photos must be different."),
  popular: flag("Popular"),
  vegetarian: flag("Vegetarian"),
  spicy: flag("Spicy"),
  isAvailable: flag("Visibility"),
};

// Nayi dish: kuch cheezein na bhejo to aam qeemat (badge khaali, rating 0, dikhti hui)
export const createFoodSchema = z.object({
  ...foodFields,
  rating: foodFields.rating.default(0),
  reviewCount: foodFields.reviewCount.default(0),
  badge: foodFields.badge.default(""),
  gallery: foodFields.gallery.default([]),
  popular: foodFields.popular.default(false),
  vegetarian: foodFields.vegetarian.default(false),
  spicy: foodFields.spicy.default(false),
  isAvailable: foodFields.isAvailable.default(true),
});

// Edit: jo bhejo wahi badle. Slug kabhi nahi badalta (yahan hai hi nahi, is liye bheja bhi jaye to hat jata hai)
export const updateFoodSchema = z
  .object(foodFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");

export const foodSlugParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/, "Dish not found."),
});

// ================= REPORTS =================
const pageField = z.coerce.number("Page must be a number.").int("Invalid page.").min(1, "Invalid page.").max(100000, "Invalid page.").default(1);

export const analyticsQuerySchema = z.object({
  days: z.enum(["7", "30", "90"], "Choose 7, 30 or 90 days.").default("7").transform(Number),
});

export const customersQuerySchema = z.object({
  q: z.string("Search must be text.").trim().max(60, "Search is too long.").optional(),
  page: pageField,
});

export const paymentsQuerySchema = z.object({
  range: z.enum(["today", "7", "30"], "Choose today, 7 or 30 days.").default("today"),
  page: pageField,
});

// ================= RIDERS =================
export const ridersQuerySchema = z.object({
  status: z.enum(["pending", "approved", "suspended", "rejected"], "Invalid status filter.").default("pending"),
  q: z.string("Search must be text.").trim().max(60, "Search is too long.").optional(),
  page: pageField,
});

// approve: pending ya rejected se (galti se reject hua ho to baad mein bhi). reject: sirf pending.
// suspend: sirf approved. reactivate: sirf suspended. Reject aur suspend ki wajah zaroori (rider ko dikhti hai)
export const riderStatusSchema = z
  .object({
    action: z.enum(["approve", "reject", "suspend", "reactivate"], "Choose a valid action."),
    reason: z.string("Reason must be text.").trim().max(200, "Reason is too long (200 characters max).").optional(),
  })
  .superRefine((body, ctx) => {
    if ((body.action === "reject" || body.action === "suspend") && (body.reason ?? "").length < 5)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Please write a reason (at least 5 characters)." });
  });

export const updateRiderSchema = z
  .object({
    name: z.string("Full name is required.").trim().min(1, "Full name is required.").max(80, "Name is too long."),
    phone,
    vehicleType,
    registration,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
