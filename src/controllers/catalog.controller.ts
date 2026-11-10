import { Request, Response } from "express";
import Category from "../models/Category";
import Food from "../models/Food";
import { escapeRegex } from "../utils/text";

// Customer ko sirf ye fields jati hain
const PUBLIC_FIELDS = "-_id -__v -createdAt -updatedAt -isAvailable";

// _id aakhir mein: barabar qeemat wali dishes har page par ek hi tarteeb mein rahen
const SORTS = {
  popular: { popular: -1, rating: -1, _id: 1 },
  rating: { rating: -1, _id: 1 },
  "price-asc": { price: 1, _id: 1 },
  "price-desc": { price: -1, _id: 1 },
  default: { _id: 1 },
} as const;

// ================= CATEGORIES =================
export const listCategories = async (req: Request, res: Response) => {
  const [categories, counts] = await Promise.all([
    Category.find({ isActive: true }).sort({ _id: 1 }).select("-_id name slug image").lean(),
    Food.aggregate<{ _id: string; items: number }>([
      { $match: { isAvailable: true } },
      { $group: { _id: "$category", items: { $sum: 1 } } },
    ]),
  ]);

  const itemsBySlug = new Map(counts.map((count) => [count._id, count.items]));

  res.status(200).json({
    success: true,
    categories: categories.map((category) => ({ ...category, items: itemsBySlug.get(category.slug) ?? 0 })),
  });
};

// ================= FOODS LIST =================
export const listFoods = async (req: Request, res: Response) => {
  const { q, category, sort, maxPrice, rating, veg, popular, page, limit } = res.locals.query;

  const filter: Record<string, unknown> = { isAvailable: true };
  if (category) filter.category = category;
  if (maxPrice !== undefined) filter.price = { $lte: maxPrice };
  if (rating !== undefined) filter.rating = { $gte: rating };
  if (veg) filter.vegetarian = true;
  if (popular) filter.popular = true;
  if (q) {
    const search = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: search }, { description: search }, { badge: search }];
  }

  const [foods, total] = await Promise.all([
    Food.find(filter)
      .sort(SORTS[sort as keyof typeof SORTS])
      .skip((page - 1) * limit)
      .limit(limit)
      .select(PUBLIC_FIELDS)
      .lean(),
    Food.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    foods,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
};

// ================= ONE FOOD =================
export const getFood = async (req: Request, res: Response) => {
  const food = await Food.findOne({ slug: req.params.slug, isAvailable: true }).select(PUBLIC_FIELDS).lean();

  if (!food) {
    res.status(404).json({ success: false, message: "Dish not found." });
    return;
  }

  res.status(200).json({ success: true, food });
};

// ================= CART LOOKUP =================
// Cart sirf slug rakhta hai: yahan se taaza naam aur qeemat. Jo dish ab nahi hai woh jawab mein nahi aati
export const lookupFoods = async (req: Request, res: Response) => {
  const foods = await Food.find({ slug: { $in: req.body.slugs }, isAvailable: true }).select(PUBLIC_FIELDS).lean();

  res.status(200).json({ success: true, foods });
};
