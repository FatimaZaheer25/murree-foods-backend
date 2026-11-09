import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";

// Request mein user ki jagah bana di
export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1. Cookie se token nikalo
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ success: false, message: "Please log in first." });
    return;
  }

  // 2. Muhar check karo
  let decoded: { id: string; iat: number };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string; iat: number };
  } catch (error) {
    res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    return;
  }

  // 3. User abhi bhi mojood ho, aur token password badalne ke baad ka ho
  // (password reset hote hi purane saare sessions khatam)
  const user = await User.findById(decoded.id).select("+passwordChangedAt");
  const changedAt = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;

  if (!user || decoded.iat < changedAt) {
    res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    return;
  }

  // 4. User request mein rakh do, aage controller use karega
  req.user = user;
  next();
};
