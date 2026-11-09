import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import Category from "../models/Category";
import Food from "../models/Food";
import { categories, foods } from "./catalog.data";

dotenv.config();

// Sirf jo cheez DB mein nahi hai woh banti hai. Dobara chalane par admin ke badlav nahi mitte
const upsertBySlug = <T extends { slug: string }>(items: readonly T[]) =>
  items.map((item) => ({
    updateOne: { filter: { slug: item.slug }, update: { $setOnInsert: item }, upsert: true },
  }));

async function seed() {
  await connectDB();

  const addedCategories = await Category.bulkWrite(upsertBySlug(categories));
  const addedFoods = await Food.bulkWrite(upsertBySlug(foods));

  console.log(`Categories: ${addedCategories.upsertedCount} added, ${categories.length} in seed file`);
  console.log(`Foods: ${addedFoods.upsertedCount} added, ${foods.length} in seed file`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.log(error);
  process.exit(1);
});
