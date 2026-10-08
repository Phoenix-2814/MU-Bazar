# Deployment configuration

## Backend

Set these environment variables in the backend host:

- `NODE_ENV=production`
- `PORT` (provided by most hosts)
- `MONGO_URI` for the production MongoDB database
- `JWT_SECRET` with a unique random secret of at least 32 characters
- `CLIENT_ORIGIN` with the exact frontend origin; use comma-separated origins if needed
- `PUBLIC_API_URL` with the public HTTPS API origin used to build uploaded image URLs
- `UPLOADS_DIR` pointing to persistent writable storage if the host's filesystem is ephemeral
- `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM`, and optionally `EMAIL_FROM_NAME` for Brevo HTTPS email delivery
- `FRONTEND_URL` as the frontend origin used for the verification link
- `GOOGLE_CLIENT_ID` as the Google OAuth 2.0 web client ID used to verify Google ID tokens

Registration creates an unverified account and sends a single-use link that expires after 24 hours.
Verify the sender address in Brevo before enabling registration. Brevo sends over HTTPS, which works
with Render's free-service network restrictions; free Render services cannot send outbound traffic
on SMTP ports 25, 465, or 587. For local development, `EMAIL_PROVIDER=smtp` continues to use the
SMTP variables in `.env.example`.

Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Do not commit `.env` files or use the sample secret from `.env.example`.

Uploaded photos are stored on disk. Configure persistent storage or move uploads to an object-storage
service before deploying to a host with ephemeral filesystems.

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
