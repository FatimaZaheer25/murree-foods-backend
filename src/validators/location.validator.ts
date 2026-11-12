import { z } from "zod";

const hotelFields = {
  name: z.string("Hotel name is required.").trim().min(1, "Hotel name is required.").max(100, "Hotel name is too long."),
  area: z.string("Area is required.").trim().min(1, "Area is required.").max(60, "Area is too long."),
  landmark: z.string("Landmark must be text.").trim().max(150, "Landmark is too long."),
  isActive: z.boolean("Status must be true or false."),
};

export const createHotelSchema = z.object({
  name: hotelFields.name,
  area: hotelFields.area,
  landmark: hotelFields.landmark.optional(),
  isActive: hotelFields.isActive.optional(),
});

export const updateHotelSchema = z.object(hotelFields).partial();

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id."),
});

const money = (label: string) =>
  z
    .number(`${label} must be a number.`)
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(100000, `${label} is too large.`);

// Khali chhor sakte hain (option chhup jata hai). 0300-1234567, 051-1234567 ya +92 300 1234567
const contactNumber = (label: string) =>
  z
    .string(`${label} must be text.`)
    .trim()
    .max(20, `${label} is too long.`)
    .refine(
      (value) => value === "" || (/^\+?[\d\s-]+$/.test(value) && /^(0|92)\d{9,11}$/.test(value.replace(/\D/g, ""))),
      `Enter a valid Pakistani ${label.toLowerCase()}, e.g. 0300-1234567.`
    );

// Sirf asli Facebook/Instagram page ka https link (koi aur website nahi)
const socialUrl = (label: string, host: string) =>
  z
    .string(`${label} must be text.`)
    .trim()
    .max(200, `${label} is too long.`)
    .refine((value) => {
      if (value === "") return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" && (url.hostname === host || url.hostname.endsWith(`.${host}`)) && url.pathname.length > 1;
      } catch {
        return false;
      }
    }, `${label} must be a https://${host}/... page link.`);

export const updateSettingsSchema = z.object({
  freeDeliveryThreshold: money("Free delivery limit"),
  deliveryFee: money("Delivery fee"),
  serviceFee: money("Service fee"),
  riderPayPerDelivery: money("Rider pay"),
  areas: z
    .array(z.string("Area must be text.").trim().min(1, "Area name is required.").max(60, "Area name is too long."), "Areas are required.")
    .min(1, "Add at least one area.")
    .max(100, "Too many areas.")
    .refine((areas) => new Set(areas.map((area) => area.toLowerCase())).size === areas.length, "Areas must be unique."),
  // Rabte: na bheje to purane hi rehte hain
  contactWhatsapp: contactNumber("WhatsApp number").optional(),
  contactPhone: contactNumber("Phone number").optional(),
  contactEmail: z
    .string("Email must be text.")
    .trim()
    .toLowerCase()
    .max(120, "Email is too long.")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address.")
    .optional(),
  facebookUrl: socialUrl("Facebook link", "facebook.com").optional(),
  instagramUrl: socialUrl("Instagram link", "instagram.com").optional(),
});
