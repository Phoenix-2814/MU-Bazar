# MU Bazar frontend

This React app uses Vite for development and production builds, and Vitest for tests.

## Local development

```sh
npm ci
npm start
```

The development server runs at `http://localhost:3000`. Set `VITE_API_URL` in `.env` to the backend origin (defaults to `http://localhost:5000`) and `VITE_GOOGLE_CLIENT_ID` to the Google web OAuth client ID.

## Build and tests

```sh
npm run build
npm test
```

## Vercel

Set the project root directory to `frontend`. Vercel builds with `npm run build` and serves the generated `dist` directory. Configure `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` in the Vercel project settings, then redeploy after changing either value.
