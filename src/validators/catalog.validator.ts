import { z } from "zod";

// URL mein ?veg=1
const flag = z.enum(["0", "1"], "Use 0 or 1.").transform((value) => value === "1");

export const foodListSchema = z.object({
  q: z.string("Search must be text.").trim().max(60, "Search is too long.").optional(),
  category: z.string("Category must be text.").trim().max(60, "Category is too long.").optional(),
  // default: jis tarteeb mein dishes bani hain (home ka Popular section)
  sort: z.enum(["popular", "rating", "price-asc", "price-desc", "default"], "Invalid sort.").default("popular"),
  maxPrice: z.coerce.number("Price must be a number.").int("Price must be a number.").min(0, "Invalid price.").optional(),
  rating: z.coerce.number("Rating must be a number.").min(0, "Invalid rating.").max(5, "Invalid rating.").optional(),
  veg: flag.optional(),
  popular: flag.optional(),
  page: z.coerce.number("Page must be a number.").int("Invalid page.").min(1, "Invalid page.").max(100000, "Invalid page.").default(1),
  limit: z.coerce.number("Limit must be a number.").int("Invalid limit.").min(1, "Invalid limit.").max(100, "Limit is too large.").default(12),
});

export const foodLookupSchema = z.object({
  slugs: z
    .array(z.string("Invalid dish.").trim().min(1, "Invalid dish.").max(80, "Invalid dish."), "Dishes are required.")
    .max(50, "Too many dishes."),
});
