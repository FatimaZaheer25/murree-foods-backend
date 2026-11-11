import { Router } from "express";
import {
  acceptOrder,
  getSummary,
  heartbeat,
  listAvailable,
  listMyDeliveries,
  markDelivered,
  releaseOrder,
  requireApprovedRider,
  setOnline,
  startDelivery,
} from "../controllers/rider.controller";
import { authorize, protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { orderNumberSchema } from "../validators/order.validator";
import { riderDeliveriesQuerySchema, riderOnlineSchema } from "../validators/rider.validator";

// Sirf approved rider
const router = Router();
router.use(protect, authorize("rider"), requireApprovedRider);

router.get("/summary", getSummary);
router.post("/heartbeat", heartbeat);
router.patch("/online", validate(riderOnlineSchema), setOnline);

router.get("/available", listAvailable);
router.post("/orders/:orderNumber/accept", validate(orderNumberSchema, "params"), acceptOrder);
router.post("/orders/:orderNumber/release", validate(orderNumberSchema, "params"), releaseOrder);
router.post("/orders/:orderNumber/start", validate(orderNumberSchema, "params"), startDelivery);
router.post("/orders/:orderNumber/deliver", validate(orderNumberSchema, "params"), markDelivered);

router.get("/deliveries", validate(riderDeliveriesQuerySchema, "query"), listMyDeliveries);

export default router;
