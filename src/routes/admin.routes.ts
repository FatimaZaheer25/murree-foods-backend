import { Router } from "express";
import { createFood, listAdminFoods, updateFood } from "../controllers/adminFood.controller";
import { cancelOrder, listAdminOrders, updateOrderStatus } from "../controllers/adminOrder.controller";
import {
  createHotel,
  deleteHotel,
  getAdminSettings,
  listAdminHotels,
  updateHotel,
  updateSettings,
} from "../controllers/location.controller";
import { getAnalytics, getDashboardStats, getPayments, listCustomers } from "../controllers/stats.controller";
import { authorize, protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  adminOrdersQuerySchema,
  analyticsQuerySchema,
  customersQuerySchema,
  paymentsQuerySchema,
  cancelOrderSchema,
  createFoodSchema,
  foodSlugParamSchema,
  updateFoodSchema,
  updateOrderStatusSchema,
} from "../validators/admin.validator";
import {
  createHotelSchema,
  idParamSchema,
  updateHotelSchema,
  updateSettingsSchema,
} from "../validators/location.validator";
import { orderNumberSchema } from "../validators/order.validator";

// Is file ke har route ke liye admin hona zaroori hai
const router = Router();
router.use(protect, authorize("admin"));

router.get("/hotels", listAdminHotels);
router.post("/hotels", validate(createHotelSchema), createHotel);
router.patch("/hotels/:id", validate(idParamSchema, "params"), validate(updateHotelSchema), updateHotel);
router.delete("/hotels/:id", validate(idParamSchema, "params"), deleteHotel);

router.get("/settings", getAdminSettings);
router.patch("/settings", validate(updateSettingsSchema), updateSettings);

router.get("/orders", validate(adminOrdersQuerySchema, "query"), listAdminOrders);
router.patch(
  "/orders/:orderNumber/status",
  validate(orderNumberSchema, "params"),
  validate(updateOrderStatusSchema),
  updateOrderStatus
);
router.post("/orders/:orderNumber/cancel", validate(orderNumberSchema, "params"), validate(cancelOrderSchema), cancelOrder);

// Dishes: add, edit, hide/show. Delete jaan boojh kar nahi hai
router.get("/foods", listAdminFoods);
router.post("/foods", validate(createFoodSchema), createFood);
router.patch("/foods/:slug", validate(foodSlugParamSchema, "params"), validate(updateFoodSchema), updateFood);

// Reports: sab asli orders aur accounts se (Pakistan time ke din)
router.get("/stats/dashboard", getDashboardStats);
router.get("/stats/analytics", validate(analyticsQuerySchema, "query"), getAnalytics);
router.get("/customers", validate(customersQuerySchema, "query"), listCustomers);
router.get("/payments", validate(paymentsQuerySchema, "query"), getPayments);

export default router;
