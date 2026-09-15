# LMR Media Big 9 Football Scoreboard

A broadcast-ready Big 9 Conference football scoreboard designed for a Hudl production truck and deployed on Vercel.

## Routes

- `/` — clean 16:9 browser-source output. It rotates games every 10 seconds and refreshes scores every 60 seconds.
- `/operator` — separate production control panel for pause/resume, previous/next, manual refresh, date selection, and rotation interval.
- `/api/scores` — server-side Minnesota-Scores.net adapter.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the broadcast output or `/operator` for controls.

## Deploy to Vercel

Import this repository into Vercel. No environment variables are required for the default Minnesota-Scores.net adapter. The adapter runs server-side so the upstream source is not queried directly from the browser.

The upstream site does not currently publish a documented structured API. The parser is isolated in `app/api/scores/route.tsx`, and the app includes a demo fallback plus stale/cache indicators so the output remains usable if the upstream HTML changes or temporarily fails. Confirm the source's terms and availability before using it for a live commercial production.

## Truck workflow

Open `/` in a 16:9 browser source at 1920×1080. Use `/operator` in a separate operator browser window. The broadcast page is intentionally free of controls; hovering the output reveals a low-opacity link to the operator page for setup convenience.
