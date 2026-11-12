import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import { AppName, appOf, cookieNameFor } from "../utils/app";

// Request mein user ki jagah bana di
export interface AuthRequest extends Request {
  user?: IUser;
}

// Is request wali app (X-App header) ki cookie
export const tokenOf = (req: Request): string | undefined => req.cookies?.[cookieNameFor(appOf(req))];

// Cookie wala token sahi ho, user abhi bhi mojood ho, token password badalne ke baad ka ho
// (password reset hote hi purane saare sessions khatam), aur user isi app ka ho. Warna null
const userFromToken = async (token: string, app: AppName) => {
  let decoded: { id: string; iat: number };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string; iat: number };
  } catch {
    return null;
  }

  const user = await User.findById(decoded.id).select("+passwordChangedAt");
  const changedAt = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
  return user && decoded.iat >= changedAt && user.role === app ? user : null;
};

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = tokenOf(req);

  if (!token) {
    res.status(401).json({ success: false, message: "Please log in first." });
    return;
  }

  const user = await userFromToken(token, appOf(req));
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
  const token = tokenOf(req);
  if (token) req.user = (await userFromToken(token, appOf(req))) ?? undefined;
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
