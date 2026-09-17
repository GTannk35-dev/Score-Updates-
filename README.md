# LMR Media Big 9 Scoreboard

A broadcast-ready Big 9 Conference scoreboard for the production truck and Vercel, covering every Big 9 team sport.

## Sports covered

Football, boys/girls soccer, volleyball, boys/girls basketball, boys/girls hockey, wrestling, baseball, softball, and boys/girls lacrosse — 13 sports, each pulled from its own scoreboard on Minnesota-Scores.net. Select the active sport from the operator page.

## Routes

- `/` — clean 16:9 browser-source output. It rotates games every 10 seconds and refreshes scores every 60 seconds. The board renders on a fixed 1920×1080 stage scaled to the viewport, so every device shows an identical frame.
- `/operator` — separate production control panel for sport selection, pause/resume, previous/next, manual refresh, calendar date selection, rotation interval, and an UP NEXT preview of the next game in rotation. Controls drive the on-air board across tabs **and across devices** (the state is mirrored through `/api/board-state`).
- `/api/scores` — server-side Minnesota-Scores.net adapter. Query params: `sport` (see `lib/sports.ts` for ids) and `date` (`YYYY-MM-DD`, repeatable).
- `/api/board-state` — cross-device operator state: POST publishes the current control snapshot, GET returns it for boards on other devices.

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
