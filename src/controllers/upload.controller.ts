import { Request, Response } from "express";
import { cloudinaryErrorText, removeUnusedPhoto, uploadDishPhoto } from "../config/cloudinary";
import { isRealPhoto } from "../middleware/upload.middleware";

// ================= UPLOAD =================
// Admin Menu form ki photo (main ya extra). Dish abhi save nahi hoti: link form mein jata hai, Save par dish mein
export const uploadPhoto = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "Please choose a photo to upload." });
    return;
  }
  if (!isRealPhoto(file.buffer)) {
    res.status(400).json({ success: false, message: "This file is not a JPG, PNG or WebP photo." });
    return;
  }

  try {
    const url = await uploadDishPhoto(file.buffer);
    res.status(201).json({ success: true, message: "Photo uploaded.", url });
  } catch (error) {
    console.log(`Photo upload failed: ${cloudinaryErrorText(error)}`);
    res.status(502).json({ success: false, message: "Photo upload failed. Please try again." });
  }
};

// ================= DISCARD =================
// Upload ki lekin dish mein save nahi ki (hata di, badal di, ya form band): Cloudinary se hatao.
// Sirf hamari folder ki photo, aur sirf jab kisi dish ya category mein na lagi ho
export const discardPhoto = async (req: Request, res: Response) => {
  const removed = await removeUnusedPhoto(req.body.url);
  res.status(200).json({ success: true, removed });
};
