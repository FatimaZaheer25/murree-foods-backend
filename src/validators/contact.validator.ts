import { z } from "zod";

// Help & Contact form. Order number marzi ka (khali chhor sakte hain)
export const contactMessageSchema = z.object({
  name: z
    .string("Your name is required.")
    .trim()
    .min(1, "Your name is required.")
    .max(80, "Name is too long.")
    .transform((value) => value.replace(/\s+/g, " ")), // email ke subject mein jata hai: ek hi line
  email: z.string("Email is required.").trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  orderNumber: z
    .string("Order number must be text.")
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^MF-\d{5,}$/.test(value), "Order number looks like MF-10001.")
    .transform((value) => value || undefined)
    .optional(),
  message: z
    .string("Please write your message.")
    .trim()
    .min(10, "Please write a little more (at least 10 characters).")
    .max(2000, "Message is too long (2000 characters max)."),
});

export const messagesQuerySchema = z.object({
  status: z.enum(["new", "resolved", "all"], "Invalid status filter.").default("new"),
  page: z.coerce.number("Page must be a number.").int("Invalid page.").min(1, "Invalid page.").max(100000, "Invalid page.").default(1),
});

export const updateMessageSchema = z.object({
  resolved: z.boolean("Resolved must be true or false."),
});
