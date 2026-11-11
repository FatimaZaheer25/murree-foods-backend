import { z } from "zod";

export const riderOnlineSchema = z.object({
  online: z.boolean("Online must be true or false."),
});

export const riderDeliveriesQuerySchema = z.object({
  range: z.enum(["today", "7", "30"], "Choose today, 7 or 30 days.").default("today"),
  page: z.coerce.number("Page must be a number.").int("Invalid page.").min(1, "Invalid page.").max(100000, "Invalid page.").default(1),
});
