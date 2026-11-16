import { Router } from "express";
import { blockRiders, cancelMyOrder, getOrder, listMyOrders, placeOrder, reviewOrder } from "../controllers/order.controller";
import { protect } from "../middleware/auth.middleware";
import { ipLimiter, orderLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { createOrderSchema, orderNumberSchema, reviewSchema } from "../validators/order.validator";

// Har order route ke liye login zaroori
const router = Router();
router.use(protect);

router.post("/", blockRiders, validate(createOrderSchema), orderLimiter, placeOrder);
router.get("/mine", listMyOrders);
router.get("/:orderNumber", validate(orderNumberSchema, "params"), getOrder);
// Customer: apna order cancel (sirf Confirmed), aur deliver ke baad rating (ek dafa)
router.post("/:orderNumber/cancel", ipLimiter, validate(orderNumberSchema, "params"), cancelMyOrder);
router.post("/:orderNumber/review", ipLimiter, validate(orderNumberSchema, "params"), validate(reviewSchema), reviewOrder);

export default router;
