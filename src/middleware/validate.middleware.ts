import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Body ya URL query check karo. Sahi ho to saaf data aage, warna pehli ghalti wapas.
// Body: req.body mein. Query: res.locals.query mein (Express 5 mein req.query sirf parhne ke liye hai)
export const validate =
  (schema: ZodType, source: "body" | "query" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === "body" ? (req.body ?? {}) : req.query);

    if (!result.success) {
      res.status(400).json({ success: false, message: result.error.issues[0].message });
      return;
    }

    if (source === "body") req.body = result.data;
    else res.locals.query = result.data;
    next();
  };
