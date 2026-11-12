import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { cloudinaryReady } from "../config/cloudinary";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const WRONG_TYPE = "Please choose a JPG, PNG or WebP photo.";

// Cloudinary ki keys na hon to file parhne se pehle hi wapas
export const requireCloudinary = (req: Request, res: Response, next: NextFunction) => {
  if (!cloudinaryReady()) {
    res.status(503).json({ success: false, message: "Photo upload is not set up yet." });
    return;
  }
  next();
};

// Photo disk par nahi, memory mein (seedha Cloudinary jati hai). Form field ka naam "photo", sirf ek file
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1 },
  fileFilter: (req, file, done) => (TYPES.includes(file.mimetype) ? done(null, true) : done(new TypeError(WRONG_TYPE))),
}).single("photo");

const LIMIT_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: "Photo is too large. The limit is 5 MB.",
  LIMIT_FILE_COUNT: "Upload one photo at a time.",
  LIMIT_UNEXPECTED_FILE: "Upload one photo at a time.",
  LIMIT_PART_COUNT: "Upload one photo at a time.",
  LIMIT_FIELD_COUNT: "Upload one photo at a time.",
};

export const dishPhotoUpload = (req: Request, res: Response, next: NextFunction) =>
  parser(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      res.status(400).json({ success: false, message: LIMIT_MESSAGES[error.code] ?? "Invalid upload." });
      return;
    }
    if (error instanceof TypeError && error.message === WRONG_TYPE) {
      res.status(400).json({ success: false, message: WRONG_TYPE });
      return;
    }
    // Toota hua form (multipart) bhi client ki ghalti hai
    if (error instanceof Error && /multipart|boundary|unexpected end/i.test(error.message)) {
      res.status(400).json({ success: false, message: "Invalid upload." });
      return;
    }
    next(error);
  });

// File ke pehle bytes dekh kar asli qisam (naam ya browser ki batayi qisam par bharosa nahi)
export const isRealPhoto = (data: Buffer) => {
  const jpg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = data.length > 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP";
  return jpg || png || webp;
};
