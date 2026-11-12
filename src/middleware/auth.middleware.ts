import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";

// Request mein user ki jagah bana di
export interface AuthRequest extends Request {
  user?: IUser;
}

// Cookie wala token sahi ho, user abhi bhi mojood ho, aur token password badalne ke baad ka ho
// (password reset hote hi purane saare sessions khatam). Warna null
const userFromToken = async (token: string) => {
  let decoded: { id: string; iat: number };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string; iat: number };
  } catch {
    return null;
  }

  const user = await User.findById(decoded.id).select("+passwordChangedAt");
  const changedAt = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
  return user && decoded.iat >= changedAt ? user : null;
};

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ success: false, message: "Please log in first." });
    return;
  }

  const user = await userFromToken(token);
  if (!user) {
    res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    return;
  }

  // User request mein rakh do, aage controller use karega
  req.user = user;
  next();
};

// Login zaroori nahi (jaise Contact form): ho to req.user, na ho ya purana ho to bhi aage
export const optionalUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;
  if (token) req.user = (await userFromToken(token)) ?? undefined;
  next();
};

// protect ke baad lagao: sirf in roles wale aage ja sakte hain
export const authorize =
  (...roles: IUser["role"][]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "You do not have permission to do this." });
      return;
    }
    next();
  };
