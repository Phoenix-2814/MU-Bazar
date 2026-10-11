# Deployment configuration

## Backend

Set these environment variables in the backend host:

- `NODE_ENV=production`
- `PORT` (provided by most hosts)
- `MONGO_URI` for the production MongoDB database
- `JWT_SECRET` with a unique random secret of at least 32 characters
- `CLIENT_ORIGIN` with the exact frontend origin; use comma-separated origins if needed
- `PUBLIC_API_URL` with the public HTTPS API origin used to build uploaded image URLs
- `IMAGEKIT_PRIVATE_KEY` for persistent image uploads through ImageKit
- `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM`, and optionally `EMAIL_FROM_NAME` for Brevo HTTPS email delivery
- `FRONTEND_URL` as the frontend origin used for the verification link
- `GOOGLE_CLIENT_ID` as the Google OAuth 2.0 web client ID used to verify Google ID tokens
- `ADMIN_EMAILS` as a comma-separated allowlist of verified MU Bazar account emails allowed to review listing reports
- `TRUST_PROXY_HOPS` (optional) as the number of reverse proxies in front of the API; defaults to `1` in production (Render) and `0` locally. Rate limiting uses it to read the real client IP

Auth endpoints are rate limited per client IP (100 requests per 15 minutes), and login also allows at most
10 failed attempts per IP and email every 15 minutes. Limits are kept in memory, so they reset when the
backend restarts and are not shared across multiple instances.

Registration creates an unverified account and sends a single-use link that expires after 24 hours.
Verify the sender address in Brevo before enabling registration. Brevo sends over HTTPS, which works
with Render's free-service network restrictions; free Render services cannot send outbound traffic
on SMTP ports 25, 465, or 587. For local development, `EMAIL_PROVIDER=smtp` continues to use the
SMTP variables in `.env.example`.

Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Do not commit `.env` files or use the sample secret from `.env.example`.

Uploaded photos are stored in ImageKit, and the resulting CDN URLs are saved in MongoDB. Existing
photos already stored as `/uploads/...` URLs continue to use the backend's legacy uploads directory;
new uploads require `IMAGEKIT_PRIVATE_KEY` to be configured on the backend.

Listing reports are stored in MongoDB. Configure `ADMIN_EMAILS` on the backend with the exact email
addresses of existing MU Bazar accounts that should receive the Reports navigation button and have
permission to review reports. The backend checks this allowlist for every admin request.
Admins can temporarily hide or restore reported listings from the report review page. Hidden listings
are excluded from the public marketplace and cannot start new buyer conversations; they remain hidden
until an authorized admin restores them. The seller can still see that their listing is hidden in My
Products.

## Frontend

Set `REACT_APP_API_URL` to the public HTTPS API origin before building the frontend. If the frontend
and API use the same origin with a reverse proxy, set it to that origin. Without this variable, a
production frontend uses its own origin for API requests.
Set `REACT_APP_GOOGLE_CLIENT_ID` to the same Google OAuth 2.0 web client ID as the backend before
building the frontend. In Google Cloud Console, add each deployed frontend domain (and
`http://localhost:3000` for development) as an authorized JavaScript origin. The browser client ID is
public; do not put a Google client secret in the frontend.

Google sign-in is restricted to Google-verified `@marwadiuniversity.ac.in` accounts. Sign-in only
accepts existing MU Bazar accounts; sign-up creates an account and asks for hosteler/outsider details.

## Before going live

- Use HTTPS for both frontend and API.
- Restrict `CLIENT_ORIGIN` to the actual frontend domain.
- Configure MongoDB network access and backups.
- Verify image uploads, chat sockets, listing CRUD, and email-domain restrictions against production.
- Verify university-email links and the configured email provider before opening registration.
