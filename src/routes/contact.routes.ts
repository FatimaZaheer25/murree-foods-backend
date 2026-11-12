import { Router } from "express";
import { createContactMessage } from "../controllers/contact.controller";
import { optionalUser } from "../middleware/auth.middleware";
import { contactLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { contactMessageSchema } from "../validators/contact.validator";

const router = Router();

// Login zaroori nahi. Login ho to paigham us account se jur jata hai
router.post("/", contactLimiter, validate(contactMessageSchema), optionalUser, createContactMessage);

export default router;
