import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth.routes";
import catalogRoutes from "./routes/catalog.routes";
import locationRoutes from "./routes/location.routes";
import adminRoutes from "./routes/admin.routes";
import orderRoutes from "./routes/order.routes";
import riderRoutes from "./routes/rider.routes";
import contactRoutes from "./routes/contact.routes";
import { startOfflineSweep } from "./utils/riderPresence";
import { notFound, errorHandler } from "./middleware/error.middleware";

dotenv.config();

// Koi zaroori setting na ho to shuru mein hi pata chale, pehle login par nahi
const missing = ["MONGODB_URI", "JWT_SECRET", "CLIENT_URL", "EMAIL_USER", "EMAIL_PASS"].filter(
  (key) => !process.env[key]
);
if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")}`);

const app = express();
const PORT = process.env.PORT || 5000;

// CLIENT_URL mein comma se kai frontend: http://localhost:3000,https://murreefoods.vercel.app
const allowedOrigins = (process.env.CLIENT_URL as string)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Backend ke aage kitne proxy hain (rate limit ko user ki asli IP mile). Local par 0
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 0));

// Middlewares. cors sab se pehle, taake error wale jawab par bhi CORS header ho
app.use(cors({ origin: allowedOrigins, credentials: true }));
// Security headers (API sirf JSON deta hai, is liye default theek hain)
app.use(helmet());
// Sab se bari asli body (dish ya settings) bhi chand KB ki hai: 100 KB se bari request foran wapas (413)
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "MurreeFoods API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api", locationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/rider", riderRoutes);
app.use("/api/contact", contactRoutes);

// Sab routes ke baad
app.use(notFound);
app.use(errorHandler);

// Pehle DB connect, phir server start
connectDB().then(() => {
  startOfflineSweep(); // 10 minute se heartbeat nahi: rider Offline
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
