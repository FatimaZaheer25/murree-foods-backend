import { Request, Response, NextFunction } from "express";

// Ghalat route par bhi JSON (Express ka default HTML nahi)
export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found." });
};

// Kharab JSON ya koi bhi anjaan error. next ka parameter zaroori hai, warna Express ise error handler nahi maanta
export const errorHandler = (err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  const isClientError = err.status !== undefined && err.status < 500;
  if (!isClientError) console.log(err);

  res
    .status(isClientError ? (err.status as number) : 500)
    .json({ success: false, message: isClientError ? "Invalid request." : "Server error" });
};
