import { Router } from "express";
import { blockRiders, getOrder, listMyOrders, placeOrder } from "../controllers/order.controller";
import { protect } from "../middleware/auth.middleware";
import { orderLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { createOrderSchema, orderNumberSchema } from "../validators/order.validator";

// Har order route ke liye login zaroori
const router = Router();
router.use(protect);

router.post("/", blockRiders, validate(createOrderSchema), orderLimiter, placeOrder);
router.get("/mine", listMyOrders);
router.get("/:orderNumber", validate(orderNumberSchema, "params"), getOrder);

export default router;
