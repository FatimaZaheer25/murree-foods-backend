import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import User from "../models/User";

dotenv.config();

// npm run make-admin your-email@example.com
// Admin banane ka sirf yehi raasta hai (koi API nahi), is liye sirf .env wala hi ye chala sakta hai
async function makeAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run make-admin your-email@example.com");

  await connectDB();

  const user = await User.findOne({ email });
  if (!user) throw new Error("No account with this email. Sign up on the website first.");
  if (!user.isVerified) throw new Error("This email is not verified yet. Complete the email code first.");

  if (user.role === "admin") {
    console.log(`${email} is already an admin. Nothing changed.`);
  } else {
    await User.updateOne({ _id: user._id }, { role: "admin" });
    console.log(`${email} is now an admin. Reload the website.`);
  }

  await mongoose.disconnect();
}

makeAdmin().catch(async (error) => {
  console.log(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exit(1);
});
