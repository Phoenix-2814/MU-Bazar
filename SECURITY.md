# Security and deployment notes

## Required production configuration

- Set `NODE_ENV=production`, a unique random `JWT_SECRET` with at least 32 characters, `MONGO_URI`, `CLIENT_ORIGIN`, and `PUBLIC_API_URL`.
- Configure the email provider, `FRONTEND_URL`, and the ImageKit private key using the hosting platform's secret manager. Never commit `.env` files.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies in front of Express. Do not trust arbitrary forwarded IP headers.
- Serve the frontend and API over HTTPS. The API sets HSTS in production; configure equivalent security headers and a restrictive content security policy on the frontend's static hosting service too.

### Render backend and Vercel frontend

- In Render, set the backend root directory to `backend`, build command to `npm ci && npm run build`, and start command to `npm start`. Render supplies `PORT`; the server binds to `0.0.0.0`.
- Set Render's HTTP health check path to `/healthz`.
- For the current deployment, set Render environment variables: `NODE_ENV=production`, `TRUST_PROXY_HOPS=1` (verify against your proxy setup), `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN=https://mu-bazar-ruddy.vercel.app`, `PUBLIC_API_URL=https://mu-bazar-api.onrender.com`, `FRONTEND_URL=https://mu-bazar-ruddy.vercel.app`, `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, and `IMAGEKIT_PRIVATE_KEY`.
- In Vercel, set the project root directory to `frontend`, then set `VITE_API_URL=https://mu-bazar-api.onrender.com` and `VITE_GOOGLE_CLIENT_ID` to the same Google client ID. These `VITE_` values are public build-time settings, not secrets.
- Add `https://mu-bazar-ruddy.vercel.app` to the OAuth client's authorized JavaScript origins. Avoid broad wildcard Vercel preview origins in production.
- After setting Vercel environment variables, redeploy so Vite embeds the production API URL and Google client ID into the static build.
- If you scale beyond one Render backend instance, provision a Render Key Value instance in the same region, then set its internal connection URL as the Render web service's `REDIS_URL`. The service uses Redis for shared HTTP limits, Socket.IO broadcasts, and message limits. Socket.IO uses WebSocket transport to avoid sticky-session requirements.
- This app's Brevo integration uses Brevo's HTTP email API when `EMAIL_PROVIDER=brevo`; it does not use SMTP in that mode. If you intend to use Brevo SMTP credentials instead, keep `EMAIL_PROVIDER=smtp` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.
- Keep the frontend and API hostnames available when configuring CSP and cookie scope. Vercel-hosted and Render-hosted default domains are separate sites, so an HTTP-only cookie migration needs custom domains under the same registrable domain or a carefully designed same-site API proxy. Keep the current bearer-token flow until those hostnames and CSRF behavior are selected.

`frontend/vercel.json` applies baseline response headers and a CSP to the Vercel site. The CSP allows only the known Render API/Socket.IO origins and the Google Identity Services endpoints required by this app; it allows HTTPS images because listing and profile images come from external image storage.

## Rate limits and scaling

When `REDIS_URL` is unset, HTTP and socket limits use process-local memory, suitable for one API instance. Set `REDIS_URL` on Render to enable the shared Redis store for all HTTP limits, per-user Socket.IO message limits, and cross-instance Socket.IO broadcasts. If the URL is configured but Redis cannot connect, the backend fails startup instead of silently reverting to per-instance counters. On Render, use the Key Value internal URL and place the datastore in the same region as the web service.

Defaults are 300 API requests per minute per IP, 120 listing reads and chat HTTP requests per minute per IP, 20 uploads per 15 minutes per IP, and 30 socket messages per user per minute. Tune them against real usage and monitor 429 responses.

## Operational checks

- `/healthz` is a readiness check and returns 503 until MongoDB is connected.
- The server handles SIGINT and SIGTERM by closing Socket.IO, MongoDB, and configured Redis connections.
- CI runs dependency vulnerability audits for backend and frontend dependencies, builds both apps, and runs the backend test suite. Review audit findings and update lockfiles through normal dependency maintenance.
- Password resets and account suspension increment a token version, invalidating existing API tokens. Users must sign in again after a reset or suspension/reactivation.

## Remaining hardening work

- Browser bearer tokens remain in local storage. An HTTP-only cookie migration needs coordinated frontend/API domain, SameSite, and CSRF decisions; until then, prevent script injection and configure a strict frontend CSP at the hosting layer.
- Redis-backed limits and broadcasts are available when `REDIS_URL` is configured; without it, this runs as a single-instance setup.
- Vercel's production build must use `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`; the old Create React App `REACT_APP_` variables are no longer read.
