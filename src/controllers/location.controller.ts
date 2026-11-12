import { Request, Response } from "express";
import Hotel, { IHotel } from "../models/Hotel";
import { getSettings } from "../models/Setting";

const duplicateHotel = (error: unknown) => (error as { code?: number }).code === 11000;
const DUPLICATE_MESSAGE = "This hotel already exists in this area.";

const adminHotel = (hotel: IHotel) => ({
  id: hotel._id,
  name: hotel.name,
  area: hotel.area,
  landmark: hotel.landmark,
  isActive: hotel.isActive,
});

type Settings = Awaited<ReturnType<typeof getSettings>>;

// Customer ko dikhne wale rabte (khali ho to frontend woh option chhupa deta hai)
const contactOf = (settings: Settings) => ({
  contactWhatsapp: settings.contactWhatsapp,
  contactPhone: settings.contactPhone,
  contactEmail: settings.contactEmail,
  facebookUrl: settings.facebookUrl,
  instagramUrl: settings.instagramUrl,
});

const adminSettings = (settings: Settings) => ({
  freeDeliveryThreshold: settings.freeDeliveryThreshold,
  deliveryFee: settings.deliveryFee,
  serviceFee: settings.serviceFee,
  riderPayPerDelivery: settings.riderPayPerDelivery,
  areas: settings.areas,
  ...contactOf(settings),
});

// ================= PUBLIC =================
// Customer ki dropdowns: sirf Active hotels
export const listLocations = async (req: Request, res: Response) => {
  const [hotels, settings] = await Promise.all([
    Hotel.find({ isActive: true }).sort({ _id: 1 }).select("-_id name area landmark").lean(),
    getSettings(),
  ]);

  res.status(200).json({ success: true, hotels, areas: settings.areas });
};

// Cart ko fees, Help page aur footer ko rabte. Rider ki kamai public nahi
export const getPublicSettings = async (req: Request, res: Response) => {
  const settings = await getSettings();
  const { freeDeliveryThreshold, deliveryFee, serviceFee } = settings;

  res.status(200).json({
    success: true,
    settings: { freeDeliveryThreshold, deliveryFee, serviceFee },
    contact: contactOf(settings),
  });
};

// ================= ADMIN: HOTELS =================
export const listAdminHotels = async (req: Request, res: Response) => {
  const hotels = await Hotel.find().sort({ _id: 1 });

  res.status(200).json({ success: true, hotels: hotels.map(adminHotel) });
};

export const createHotel = async (req: Request, res: Response) => {
  const { areas } = await getSettings();
  if (!areas.includes(req.body.area)) {
    res.status(400).json({ success: false, message: "Please choose an area from the list." });
    return;
  }

  try {
    const hotel = await Hotel.create(req.body);
    res.status(201).json({ success: true, message: "Hotel added.", hotel: adminHotel(hotel) });
  } catch (error) {
    if (!duplicateHotel(error)) throw error;
    res.status(409).json({ success: false, message: DUPLICATE_MESSAGE });
  }
};

export const updateHotel = async (req: Request, res: Response) => {
  if (req.body.area !== undefined) {
    const { areas } = await getSettings();
    if (!areas.includes(req.body.area)) {
      res.status(400).json({ success: false, message: "Please choose an area from the list." });
      return;
    }
  }

  try {
    const hotel = await Hotel.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after", runValidators: true });
    if (!hotel) {
      res.status(404).json({ success: false, message: "Hotel not found." });
      return;
    }
    res.status(200).json({ success: true, message: "Hotel updated.", hotel: adminHotel(hotel) });
  } catch (error) {
    if (!duplicateHotel(error)) throw error;
    res.status(409).json({ success: false, message: DUPLICATE_MESSAGE });
  }
};

export const deleteHotel = async (req: Request, res: Response) => {
  const hotel = await Hotel.findByIdAndDelete(req.params.id);

  if (!hotel) {
    res.status(404).json({ success: false, message: "Hotel not found." });
    return;
  }
  res.status(200).json({ success: true, message: "Hotel removed." });
};

// ================= ADMIN: SETTINGS =================
export const getAdminSettings = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, settings: adminSettings(await getSettings()) });
};

export const updateSettings = async (req: Request, res: Response) => {
  // Jis area mein hotel hai woh list se nahi hat sakta
  const inUse = await Hotel.distinct("area", { area: { $nin: req.body.areas } });
  if (inUse.length) {
    res.status(409).json({ success: false, message: `Hotels still use: ${inUse.join(", ")}.` });
    return;
  }

  const settings = await getSettings();
  settings.set(req.body);
  await settings.save();

  res.status(200).json({ success: true, message: "Settings saved.", settings: adminSettings(settings) });
};
