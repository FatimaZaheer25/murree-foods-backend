# MurreeFoods Backend

The API for MurreeFoods.com: menu, accounts, orders, the admin panel, riders and the Help & Contact form.
It uses Express 5, TypeScript, MongoDB (Mongoose) and zod. Dish photos are stored on Cloudinary.

Three Next.js apps use this API: the website (`murree-foods`, port 3000), the admin panel (`murree-foods-admin`,
port 3001) and the rider panel (`murree-foods-rider`, port 3002). They live in the folder above this one; its
README explains how to start everything with one command.

## Run it on your computer

1. Install Node.js 20 or newer.
2. Install the packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill it in (see [Environment variables](#environment-variables)).
4. Add the starting menu, hotels and settings:
   ```bash
   npm run seed
   ```
   You can run it again later. It only adds what is missing and never undoes changes made in the admin panel.
5. Start the API:
   ```bash
   npm run dev
   ```
   It runs on http://localhost:5000. Check http://localhost:5000/api/health.

## Make yourself an admin

There is no admin sign-up on purpose.

1. Sign up on the website with your email and enter the email code.
2. Run:
   ```bash
   npm run make-admin your-email@example.com
   ```
3. Log in on the Admin panel (http://localhost:3001). An admin account can no longer log in on the website.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and restarts it when you change a file |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs the compiled API (use this on the server) |
| `npm run seed` | Adds the starting categories, dishes, hotels and settings, without overwriting |
| `npm run make-admin <email>` | Turns a verified account into an admin |

## Environment variables

| Name | Required | Example | Notes |
| --- | --- | --- | --- |
| `MONGODB_URI` | Yes | `mongodb+srv://…/murreefoods` | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | a long random string | Signs the login cookie. Changing it logs everyone out |
| `JWT_EXPIRES_IN` | No | `7d` | How long a login lasts |
| `CLIENT_URL` | Yes | `http://localhost:3000,http://localhost:3001,http://localhost:3002` | Addresses of the website, admin panel and rider panel, comma separated, no trailing `/` |
| `EMAIL_USER` | Yes | `yourname@gmail.com` | Gmail account that sends codes and notices |
| `EMAIL_PASS` | Yes | 16-letter app password | A Gmail **App Password**, not your normal password |
| `CONTACT_INBOX` | No | `support@yourdomain.com` | Where contact messages are emailed. Empty = `EMAIL_USER` |
| `CLOUDINARY_CLOUD_NAME` | For photo upload | from Cloudinary | Cloudinary → Settings → API Keys |
| `CLOUDINARY_API_KEY` | For photo upload | from Cloudinary | |
| `CLOUDINARY_API_SECRET` | For photo upload | from Cloudinary | Keep it only in this `.env`, never in an app |
| `PORT` | No | `5000` | Most hosts set this for you |
| `NODE_ENV` | On the server | `production` | Makes the login cookie `Secure` and `SameSite=None` |
| `TRUST_PROXY` | On the server | `2` | Number of proxies in front of the API, so rate limits see the real visitor IP |

The API stops at start-up if a required variable is missing. Never commit `.env`.
Without the three Cloudinary keys the API still starts; uploading a dish photo then says "Photo upload is not set up
yet."

## Deploying (notes for later)

Nothing is deployed yet. When you do:

1. **Database:** use MongoDB Atlas. In Network Access, allow the backend host's IP addresses.
2. **Backend host** (for example Render or Railway):
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Set all the variables above, with `NODE_ENV=production`.
   - Set `CLIENT_URL` to the real addresses of all three apps (website, admin panel, rider panel).
3. **First time on the real database:** run `npm run seed`, sign up on the website, then run
   `npm run make-admin your-email@example.com`.
   Run both from your computer with the Atlas `MONGODB_URI` in `.env`.
4. **The three apps (Vercel):** one Vercel project per app (see the main README). In each, set `BACKEND_URL` to
   the backend address and `NEXT_PUBLIC_API_URL=/api`.
   The browser then talks only to that app's own domain, and Vercel forwards `/api/*` to this API.
   This keeps the login cookies first-party, which iPhone Safari needs.
5. **`TRUST_PROXY`:** count the proxies between the visitor and the API. With the Vercel rewrite plus one load
   balancer on the host, that is `2`. If it is wrong, rate limits treat every visitor as one person.
6. **Admin settings:** after the first login, open Admin → Settings and fill in the fees, delivery areas and
   contact details (WhatsApp, phone, email, Facebook and Instagram).

## Security in place

- Passwords hashed with bcrypt. Login uses an `httpOnly` cookie, a separate one for each app (`mf_customer`,
  `mf_admin`, `mf_rider`). Each app sends an `X-App` header so the API reads the right cookie, and an account
  can only log in to its own app. A password reset ends all old sessions.
- Every request body, query and URL value is checked with zod.
- Admin and rider routes check the account role.
- Rate limits on sign-up, login, email codes, orders and the contact form (5 per hour per IP).
- Security headers with `helmet`. Request bodies over 100 KB are refused.
- Dish photo uploads: admins only, one JPG, PNG or WebP file up to 5 MB, checked by its first bytes (not just its
  name), kept in memory (never on disk) and sent to Cloudinary. Max 100 uploads per admin per hour. Only photos
  this API uploaded (its own Cloudinary folder) are ever deleted, and only when no dish uses them.
- Rider CNIC numbers are never sent to or stored by the API.
- Customers can only cancel or rate their own orders (someone else's order number gives "not found"). Cancel works
  only while the order is Confirmed; a rating only after delivery, once.

## Order rules

- **Open / closed:** Admin → Settings → Ordering. `acceptingOrders` (switch) and `openTime`/`closeTime`
  (`HH:MM`, Pakistan time, both empty = all day, late nights like 18:00–02:00 work). `GET /api/store-status` tells
  the website, and `POST /api/orders` refuses orders when closed (409).
- **Minimum order:** `minOrderAmount` (food total without fees, 0 = none). Checked when the order is placed.
- **Rider first:** admin can set Out for Delivery or Delivered only when the order has a rider.
- **Customer:** `POST /api/orders/:orderNumber/cancel` (while Confirmed) and `POST /api/orders/:orderNumber/review`
  (`{ stars: 1-5, comment? }`, after delivery, once). A rating also updates each dish's rating and review count.
- **Emails to the customer:** confirmed, delivered and cancelled, with a link to the tracking page. The link uses the
  first address in `CLIENT_URL` (the website), so keep the website first. A failed email never blocks the order.
- **Sign-up:** a correct email code also logs the person in to the app they signed up from.
