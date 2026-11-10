import { Router } from "express";
import { getPublicSettings, listLocations } from "../controllers/location.controller";

const router = Router();

router.get("/locations", listLocations);
router.get("/settings", getPublicSettings);

export default router;
