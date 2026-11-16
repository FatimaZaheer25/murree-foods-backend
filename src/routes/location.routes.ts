import { Router } from "express";
import { getPublicSettings, getStoreStatus, listLocations } from "../controllers/location.controller";

const router = Router();

router.get("/locations", listLocations);
router.get("/settings", getPublicSettings);
// Abhi orders le rahe hain? (Cart/Checkout, hamesha taaza)
router.get("/store-status", getStoreStatus);

export default router;
