import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Body check karo. Sahi ho to saaf data (trim, lowercase) aage, warna pehli ghalti wapas
export const validate = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    res.status(400).json({ success: false, message: result.error.issues[0].message });
    return;
  }

  req.body = result.data;
  next();
};
