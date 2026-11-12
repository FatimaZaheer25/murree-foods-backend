import { Request } from "express";

// Teen frontend apps. Har app ka naam usi role ka naam hai jo us mein login ho sakta hai
// (customer website mein customer, admin panel mein admin, rider panel mein rider)
export const APPS = ["customer", "admin", "rider"] as const;
export type AppName = (typeof APPS)[number];

// Har app apni har request ke saath "X-App: admin" jaisa header bhejti hai. Header na ho (purana client,
// Next server ka menu fetch, curl) to customer. Header sirf cookie chunta hai: role ka check alag hota hai
export const appOf = (req: Request): AppName => {
  const value = req.get("x-app");
  return APPS.find((app) => app === value) ?? "customer";
};

// Har app ki alag cookie: localhost par saari ports ek hi cookie dekhti hain, alag naam se
// ek browser mein teeno apps mein ek saath login reh sakte hain
export const cookieNameFor = (app: AppName) => `mf_${app}`;

// Password sahi tha lekin account doosri app ka hai: frontend is "correctApp" se sahi app ka link dikhata hai
export const WRONG_APP_MESSAGE: Record<AppName, string> = {
  customer: "This is a customer account. Please log in on the MurreeFoods website.",
  admin: "This is an admin account. Please log in on the Admin panel.",
  rider: "This is a rider account. Please log in on the Rider app.",
};
