import { Router } from "express";
import {
  createHotel,
  deleteHotel,
  getAdminSettings,
  listAdminHotels,
  updateHotel,
  updateSettings,
} from "../controllers/location.controller";
import { authorize, protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createHotelSchema,
  idParamSchema,
  updateHotelSchema,
  updateSettingsSchema,
} from "../validators/location.validator";

// Is file ke har route ke liye admin hona zaroori hai
const router = Router();
router.use(protect, authorize("admin"));

router.get("/hotels", listAdminHotels);
router.post("/hotels", validate(createHotelSchema), createHotel);
router.patch("/hotels/:id", validate(idParamSchema, "params"), validate(updateHotelSchema), updateHotel);
router.delete("/hotels/:id", validate(idParamSchema, "params"), deleteHotel);

router.get("/settings", getAdminSettings);
router.patch("/settings", validate(updateSettingsSchema), updateSettings);

export default router;
