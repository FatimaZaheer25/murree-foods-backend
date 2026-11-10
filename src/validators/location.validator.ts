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
});
