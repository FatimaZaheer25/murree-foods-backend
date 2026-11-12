import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import Category from "../models/Category";
import Food from "../models/Food";

// Admin ki upload ki hui dish photos Cloudinary ke is folder mein jati hain
export const DISH_FOLDER = "murree-foods/dishes";
// Is se bari photo Cloudinary khud chhoti kar deti hai (browser bhi bhejne se pehle 1600 tak chhoti karta hai)
const MAX_SIDE = 1600;

// Teeno keys .env mein hon tabhi upload chalta hai. Na hon to server phir bhi chalta hai,
// bas upload par "Photo upload is not set up yet." (values kabhi log nahi hoti)
const KEYS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;

export const cloudinaryReady = () => KEYS.every((key) => process.env[key]?.trim());

// .env server.ts mein import ke baad parhi jati hai: is liye config pehli zaroorat par, shuru mein nahi
let configured = false;
const client = () => {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
      api_key: process.env.CLOUDINARY_API_KEY?.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
};

// Cloudinary ka error log karne ke liye: sirf code aur ek aam jumla (us ke message mein API key aa sakti hai)
export const cloudinaryErrorText = (error: unknown) => {
  const code = (error as { http_code?: number } | null)?.http_code;
  if (code === 401) return "Cloudinary rejected the keys (check CLOUDINARY_* in the backend .env)";
  return `Cloudinary error${code ? ` (HTTP ${code})` : ""}`;
};

// Photo Cloudinary par. Wapas: https link
export const uploadDishPhoto = (buffer: Buffer) =>
  new Promise<string>((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      {
        folder: DISH_FOLDER,
        resource_type: "image",
        allowed_formats: ["jpg", "png", "webp"],
        // Rakhne se pehle hi 1600px se bari na rahe (chhoti photo waisi hi rehti hai)
        transformation: [{ width: MAX_SIDE, height: MAX_SIDE, crop: "limit" }],
        timeout: 60_000,
      },
      (error, result?: UploadApiResponse) => (error || !result ? reject(error ?? new Error("No upload result")) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });

// Link hamari apni upload ki hui photo ka hai? (isi cloud aur isi folder ki). Tab hi us ka public_id milta hai.
// Purani /images/ photos, Unsplash ya kisi aur ki Cloudinary photo kabhi delete nahi hoti
export const ownPhotoId = (url: string): string | null => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return null;
  const match = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:v\d+\/)?(murree-foods\/dishes\/[\w-]+)\.(?:jpe?g|png|webp)$/);
  return match && match[1] === cloud ? match[2] : null;
};

// Photo kisi dish ya category mein lagi hai?
const inUse = async (url: string) =>
  !!(await Food.exists({ $or: [{ image: url }, { gallery: url }] })) || !!(await Category.exists({ image: url }));

// Hamari photo jo ab kahin nahi lagi: Cloudinary se hatao. Ghalti ho to sirf log (dish save ho chuki hoti hai)
export const removeUnusedPhoto = async (url: string): Promise<boolean> => {
  const publicId = ownPhotoId(url);
  if (!publicId || !cloudinaryReady() || (await inUse(url))) return false;
  try {
    const result = await client().uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    return result?.result === "ok";
  } catch (error) {
    console.log(`Could not delete photo ${publicId}: ${cloudinaryErrorText(error)}`);
    return false;
  }
};

// Dish save ke baad peeche chalta hai: koi bhi ghalti yahin ruk jaye (server band na ho)
export const removeUnusedPhotos = async (urls: string[]) => {
  for (const url of new Set(urls)) {
    await removeUnusedPhoto(url).catch((error: Error) => console.log(`Photo cleanup failed: ${error.message}`));
  }
};
