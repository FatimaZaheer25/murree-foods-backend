import { Router } from "express";
import { getFood, listCategories, listFoods, lookupFoods } from "../controllers/catalog.controller";
import { validate } from "../middleware/validate.middleware";
import { foodListSchema, foodLookupSchema } from "../validators/catalog.validator";

// Ye public hain aur Next server sab users ke liye ek hi IP se bulata hai, is liye IP limit nahi lagayi
const router = Router();

router.get("/categories", listCategories);
router.get("/foods", validate(foodListSchema, "query"), listFoods);
router.post("/foods/lookup", validate(foodLookupSchema), lookupFoods);
router.get("/foods/:slug", getFood);

export default router;
