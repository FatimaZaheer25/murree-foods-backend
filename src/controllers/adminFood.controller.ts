import { Request, Response } from "express";
import Category from "../models/Category";
import Food, { IFood } from "../models/Food";
import { removeUnusedPhotos } from "../config/cloudinary";
import { escapeRegex, slugify } from "../utils/text";

// Admin ko poori dish, chhupi hui samait
const adminFood = (food: IFood) => ({
  slug: food.slug,
  name: food.name,
  category: food.category,
  description: food.description,
  longDescription: food.longDescription,
  price: food.price,
  time: food.time,
  rating: food.rating,
  reviewCount: food.reviewCount,
  badge: food.badge,
  image: food.image,
  gallery: food.gallery,
  popular: food.popular,
  vegetarian: food.vegetarian,
  spicy: food.spicy,
  isAvailable: food.isAvailable,
});

const duplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

// Naam, category aur photos ki woh jaanch jo sirf database dekh kar ho sakti hai
const checkFood = async (body: Partial<IFood>, current?: IFood): Promise<{ status: number; message: string } | null> => {
  if (body.name !== undefined && body.name.toLowerCase() !== current?.name.toLowerCase()) {
    const taken = await Food.exists({
      name: new RegExp(`^${escapeRegex(body.name)}$`, "i"),
      ...(current ? { _id: { $ne: current._id } } : {}),
    });
    if (taken) return { status: 409, message: "A dish with this name already exists." };
  }

  if (body.category !== undefined && body.category !== current?.category && !(await Category.exists({ slug: body.category }))) {
    return { status: 400, message: "Please choose a category from the list." };
  }

  const image = body.image ?? current?.image;
  const gallery = body.gallery ?? current?.gallery ?? [];
  if (image && gallery.includes(image)) {
    return { status: 400, message: "Extra photos must be different from the main photo." };
  }

  return null;
};

// ================= LIST =================
// Saari dishes (chhupi hui bhi) + categories dropdown ke liye. Nayi pehle
export const listAdminFoods = async (req: Request, res: Response) => {
  const [foods, categories] = await Promise.all([
    Food.find().sort({ _id: -1 }),
    Category.find().sort({ _id: 1 }).select("-_id name slug isActive").lean(),
  ]);

  res.status(200).json({ success: true, foods: foods.map(adminFood), categories });
};

// ================= ADD =================
export const createFood = async (req: Request, res: Response) => {
  const problem = await checkFood(req.body);
  if (problem) {
    res.status(problem.status).json({ success: false, message: problem.message });
    return;
  }

  // Slug naam se banta hai aur phir kabhi nahi badalta (cart, links aur purane orders isi se chalte hain).
  // Chhupi dish ka slug bhi maujood hota hai, is liye zaroorat ho to -2, -3
  const base = slugify(req.body.name);
  let slug = base;
  for (let n = 2; await Food.exists({ slug }); n++) slug = `${base}-${n}`;

  try {
    const food = await Food.create({ ...req.body, slug });
    res.status(201).json({ success: true, message: "Dish added.", food: adminFood(food) });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    res.status(409).json({ success: false, message: "This dish was just added. Please refresh the list." });
  }
};

// ================= EDIT / HIDE / SHOW =================
// Delete nahi hota: purane orders dish se jure rehte hain. Chhupane ke liye isAvailable: false
export const updateFood = async (req: Request, res: Response) => {
  const food = await Food.findOne({ slug: req.params.slug });
  if (!food) {
    res.status(404).json({ success: false, message: "Dish not found." });
    return;
  }

  const problem = await checkFood(req.body, food);
  if (problem) {
    res.status(problem.status).json({ success: false, message: problem.message });
    return;
  }

  const photosBefore = [food.image, ...food.gallery];
  food.set(req.body);
  await food.save();

  // Jo photos is dish se hatin aur kahin aur nahi lagi: Cloudinary se bhi hatao (sirf hamari upload ki hui).
  // Jawab ka intezar nahi: dish to save ho chuki
  const photosAfter = [food.image, ...food.gallery];
  void removeUnusedPhotos(photosBefore.filter((url) => !photosAfter.includes(url)));

  const message =
    Object.keys(req.body).length === 1 && "isAvailable" in req.body
      ? req.body.isAvailable
        ? "Dish is visible to customers."
        : "Dish hidden from customers."
      : "Dish updated.";

  res.status(200).json({ success: true, message, food: adminFood(food) });
};
