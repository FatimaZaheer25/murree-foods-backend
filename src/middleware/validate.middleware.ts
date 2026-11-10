import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Body, URL query ya route params check karo. Sahi ho to saaf data aage, warna pehli ghalti wapas.
// Body: req.body mein. Query: res.locals.query mein (Express 5 mein req.query sirf parhne ke liye hai)
export const validate =
  (schema: ZodType, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const input = source === "body" ? (req.body ?? {}) : source === "query" ? req.query : req.params;
    const result = schema.safeParse(input);

    if (!result.success) {
      res.status(400).json({ success: false, message: result.error.issues[0].message });
      return;
    }

    if (source === "body") req.body = result.data;
    if (source === "query") res.locals.query = result.data;
    next();
  };
