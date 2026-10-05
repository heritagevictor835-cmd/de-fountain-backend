[README.md](https://github.com/user-attachments/files/33051478/README.md)
# De Fountain of Knowledge Academy — Backend

The API the public site's portals run on: parent, student and admin/super admin, with Paystack payments and receipts. This covers the full build plan — Phases 2 through 7.

## What's here

- `prisma/schema.prisma` — the full database design
- `src/app.js` — builds the Express app (routes, middleware, error handling) — this is what the test suite imports
- `src/server.js` — checks required env vars, then starts `app.js` listening
- `src/routes/auth.js` — parent self-registration + shared login for every role
- `src/routes/parent.js` — register a child, list children/fees, pay a fee, download a receipt, announcements, a child's results
- `src/routes/admin.js` — students, parents, fees, payments, receipts, results, announcements, staff accounts and their activation, financial summary
- `src/routes/payments.js` — the Paystack webhook
- `src/routes/student.js` — a student's own profile, results and announcements
- `src/middleware/auth.js` — checks the login token **and** that the account is still active
- `src/lib/schoolStructure.js` — valid classes per section, used to validate registration
- `src/lib/paystack.js` — starts and verifies Paystack transactions
- `src/lib/receipts.js` — confirms a payment and creates its receipt, idempotently
- `src/lib/receiptPdf.js` — renders a receipt as a downloadable PDF
- `src/lib/safeSelect.js` — the User fields that are safe to send back over the API (never the password hash)
- `src/lib/validation.js` — shared password rule
- `tests/` — the automated test suite (see "Running the tests" below)

## Setting this up from scratch

1. **Install Node.js** (v18 or newer) from nodejs.org if you don't have it.
2. **Get a free Postgres database.** Neon (neon.tech) or Render (render.com) both have a free tier — create a database there and copy its connection string.
3. **Install dependencies:**
   npm install
4. **Create your .env file:**
   cp .env.example .env
   Fill in DATABASE_URL with the connection string from step 2, and set JWT_SECRET to any long random string.
5. **Create the database tables:**
   npx prisma migrate dev --name init
6. **Run it:**
   npm run dev
   The API starts at http://localhost:4000 — visit http://localhost:4000/health to check it's running.

## Trying it out

**Accounts**
- POST /api/auth/register/parent with { "name", "email", "password" } (8+ characters) — creates a parent account
- POST /api/auth/login with { "identifier", "password" } — logs in any role, returns a token

**Parent** (needs `Authorization: Bearer <token>` from a parent login)
- POST /api/parent/children — register a child
- GET /api/parent/children — list your children and their fees
- GET /api/parent/fees — every fee raised for your children
- POST /api/parent/fees/:feeId/pay — returns a Paystack checkout link
- GET /api/parent/payments/verify/:reference — call once Paystack redirects back
- GET /api/parent/receipts/:id/pdf — download a receipt
- GET /api/parent/announcements — announcements for "all", "parents", or any of your children's sections
- GET /api/parent/children/:id/results — one child's results

**Student** (needs a token from a student login — see create-login below)
- GET /api/student/me, GET /api/student/results, GET /api/student/announcements

**Admin** (needs a token from an Admin or Super Admin login)
- GET /api/admin/students — supports ?section= and ?className= filters
- GET /api/admin/students/:id — one student's full detail
- PATCH /api/admin/students/:id — correct a student's details
- GET /api/admin/parents — every parent account and their children
- POST /api/admin/students/:id/create-login — gives a student their own portal login
- POST /api/admin/fees, GET /api/admin/fees
- POST /api/admin/fees/:id/mark-paid — record a fee paid outside Paystack (cash, bank transfer at the office); still produces a proper Payment and Receipt
- GET /api/admin/payments, GET /api/admin/receipts/:id/pdf
- POST /api/admin/results, GET /api/admin/students/:id/results
- POST /api/admin/announcements, GET /api/admin/announcements

**Super Admin only**
- POST /api/admin/staff — create another Admin or Super Admin
- GET /api/admin/staff — list every staff account
- PATCH /api/admin/staff/:id with { "active": false } — deactivate a staff account. This takes effect immediately, even on a token that hasn't expired yet — you can't deactivate your own account.
- GET /api/admin/reports/summary — students count, and fees raised/paid/pending in both count and naira

The very first Super Admin can't be created through the API (nothing can call `/staff` yet) — create it directly in the database with `npx prisma studio` after your first migration, then use it to create everyone else.

## Setting up Paystack

1. Create a Paystack account at paystack.com and complete their business verification.
2. In the dashboard, go to Settings > API Keys & Webhooks. Copy the Secret Key into PAYSTACK_SECRET_KEY in your .env.
3. Once this API is deployed, set the Webhook URL in that same dashboard page to `https://<your-domain>/api/payments/webhook`. That's what reliably marks a fee as paid — the redirect-back verify endpoint is just for showing the parent an instant result.
4. Start in Paystack's **test mode** (test secret key, test cards) until a full payment works end to end, then switch to live keys.

## Running the tests

The test suite needs its own throwaway Postgres database — it deletes data from it before every test, so **never point it at production**.

1. Create a second, empty Postgres database (a free Neon project works well for this).
2. `cp .env.test.example .env.test` and fill in its DATABASE_URL.
3. Push the schema to it once: `npx dotenv -e .env.test -- npx prisma migrate deploy` (or just run `migrate dev` once against it manually).
4. `npm test`

What's covered: registration and login (including the password-length rule and duplicate-email handling), that every role is locked out of every other role's routes, that a deactivated account loses access immediately, and that student listings never leak a parent's password hash — plus the registration and fee validation rules. This isn't exhaustive, and I haven't been able to run it myself in this environment (no network access here) — treat a fresh `npm test` run as the real first check, not something already proven to pass.

## Security fixes made along the way

While building the admin panel I found and fixed a real bug worth flagging directly: a few admin endpoints (student listing, fee listing, announcement listing) were including the full parent/poster user record, which in Prisma means **every field, including the password hash** — it never printed anywhere visible, but it was present in the raw API response. All three now explicitly select only safe fields, and `tests/access-control.test.js` has a regression test that fails the build if this ever comes back.

Other hardening done at the same time: async errors in a route no longer hang the request or crash the server (`express-async-errors` + a global error handler); login and registration are rate-limited; every password is required to be 8+ characters; and account status is checked against the database on every request, not just at login, so deactivating a staff account takes effect immediately.

## Go-live checklist

- [ ] Postgres database provisioned (production, separate from your test database)
- [ ] `JWT_SECRET` set to a long random value — not the example placeholder
- [ ] Paystack **live** keys in place, webhook URL pointed at the real domain
- [ ] `PAYSTACK_CALLBACK_URL` updated to the real frontend's payment-result page
- [ ] First Super Admin created via Prisma Studio; used to create the rest of the staff accounts
- [ ] CORS currently allows any origin (`cors()` with no options) — worth restricting to your actual frontend domain once it exists
- [ ] `NODE_ENV=production` set in the hosting environment
- [ ] A full payment run through in Paystack test mode — register a child, raise a fee, pay it, confirm the receipt PDF downloads — before flipping to live keys
- [ ] `npm test` passing against a real test database

## Deploying

Render can host both this API and a Postgres database in one place, which keeps a first deployment simple. When you're ready, I'll walk through connecting this project, setting the same environment variables as your .env, and pointing your domain and Paystack webhook at it.
