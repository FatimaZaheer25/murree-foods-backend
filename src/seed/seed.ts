import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import Category from "../models/Category";
import Food from "../models/Food";
import Hotel from "../models/Hotel";
import { getSettings } from "../models/Setting";
import { categories, foods } from "./catalog.data";
import { hotels } from "./locations.data";

dotenv.config();

// Sirf jo cheez DB mein nahi hai woh banti hai. Dobara chalane par admin ke badlav nahi mitte
const insertMissing = <T extends object>(items: readonly T[], keys: (keyof T)[]) =>
  items.map((item) => ({
    updateOne: {
      filter: Object.fromEntries(keys.map((key) => [key, item[key]])),
      update: { $setOnInsert: item },
      upsert: true,
    },
  }));

async function seed() {
  await connectDB();

  const addedCategories = await Category.bulkWrite(insertMissing(categories, ["slug"]));
  const addedFoods = await Food.bulkWrite(insertMissing(foods, ["slug"]));
  const addedHotels = await Hotel.bulkWrite(insertMissing(hotels, ["name", "area"]));
  await getSettings(); // pehli dafa default fees aur areas ban jate hain

  console.log(`Categories: ${addedCategories.upsertedCount} added, ${categories.length} in seed file`);
  console.log(`Foods: ${addedFoods.upsertedCount} added, ${foods.length} in seed file`);
  console.log(`Hotels: ${addedHotels.upsertedCount} added, ${hotels.length} in seed file`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.log(error);
  process.exit(1);
});
