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
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` for verification email
- `FRONTEND_URL` as the frontend origin used for the verification link

Registration creates an unverified account and sends a single-use link that expires after 24 hours.
Set up SMTP before enabling registration; users cannot log in until they verify their MU email.

Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Do not commit `.env` files or use the sample secret from `.env.example`.

Uploaded photos are stored on disk. Configure persistent storage or move uploads to an object-storage
service before deploying to a host with ephemeral filesystems.

## Frontend

Set `REACT_APP_API_URL` to the public HTTPS API origin before building the frontend. If the frontend
and API use the same origin with a reverse proxy, set it to that origin. Without this variable, a
production frontend uses its own origin for API requests.

## Before going live

- Use HTTPS for both frontend and API.
- Restrict `CLIENT_ORIGIN` to the actual frontend domain.
- Configure MongoDB network access and backups.
- Verify image uploads, chat sockets, listing CRUD, and email-domain restrictions against production.
- Verify university-email links and the SMTP delivery setup before opening registration.
