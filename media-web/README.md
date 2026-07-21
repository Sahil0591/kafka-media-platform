# media-web

The Aperture front-end: a dark, cinematic client for the event-driven media
platform, with the Kafka pipeline rendered as a first-class part of the UI.

## Run

The whole stack, including this app, comes up with Docker from the repo root:

```bash
docker compose up --build
# app  http://localhost:5173
# api  http://localhost:8080
```

For front-end work, run the API in Docker and this app on the host - Vite gives
you hot reload and proxies `/api` to `localhost:8080`, so the browser still sees
a single origin:

```bash
npm install
npm run dev            # http://localhost:5173
VITE_API_TARGET=http://localhost:8081 npm run dev   # point at a different API
```

## Design language

Everything is dark by construction, not by inverting a light theme.

**Surfaces.** A deep, slightly cool black ramp - `void` to `abyss` to `surface`
to `surface-2` to `surface-3`. Each step is a real elevation. Grouped content
sits on a frosted `.glass` panel: translucent gradient fill, blurred and
saturation-lifted backdrop, hairline border, and a top inner highlight that reads
as light catching a physical edge. The recipe lives in one CSS class so it cannot
drift.

**Colour.** A violet-to-cyan signature spectrum: violet reads as *media*, cyan as
*live data* - the two halves of the product. Status colours (`ready`, `live`,
`warn`, `fail`) are reserved and never used decoratively, so a red on screen
always means something failed.

**Texture.** A filmic grain overlay sits above everything at ~3% opacity. Without
it, large flat blacks band visibly on OLED panels.

**Motion.** One easing vocabulary (`--ease-out-expo`, `--ease-in-out-soft`) shared
by CSS transitions and Framer Motion springs. `prefers-reduced-motion` collapses
all of it.

## Architecture

```
src/
  auth/        session state, restore-on-boot, central sign-out
  stream/      the owner-scoped SSE connection, held above the router
  hooks/       library reconciliation, polling, the ops firehose
  lib/         API client, wire types, formatters
  components/
    ui/        Button, Panel, Field, StatusBadge, Skeleton, Aurora
    media/     Poster, MediaCard, Rail, Hero
    player/    HLS engine hook and the custom player chrome
    upload/    Dropzone and the pipeline visualizer
    charts/    Sparkline, BarRow
    ops/       consumer group cards, event feed, stat tiles
  routes/      SignIn, Library, Upload, Watch, Pulse
```

### Live data

The API exposes two server-sent event channels. `StreamProvider` owns the
owner-scoped one for the whole session - it sits above the router so navigating
between pages never drops the connection, and it tracks *connecting*, *live*,
*reconnecting* and *offline* separately so the connection pill in the shell always
tells the truth about whether the screen is current.

`EventSource` cannot set request headers, so the API accepts the JWT as an
`access_token` query parameter on `/api/stream/**` and nowhere else.

Lists reconcile REST against the stream: the REST call establishes a baseline,
events overlay newer status on top, and a terminal event schedules one debounced
refetch to pick up fields the event does not carry. Nothing polls for status.

### Charts

Deliberate, not default:

- Throughput is a single series, so it gets one hue and no legend. Its rate is
  derived from the delta between cumulative offset snapshots; a negative delta
  means offsets were reset, and that sample is discarded rather than drawn as a
  spike.
- Lag and topic bars all wear the same hue. Those categories have no natural
  order, so shading each bar by its own value would double-encode length as
  colour. Amber appears only when a row crosses a threshold - that is state.
- Every bar prints its label and value as text, so each row is its own table
  view and no number is reachable only by reading a length.
- The `ready` green is tuned against the `live` cyan: an emerald sat at only
  dE 12 in OKLab, below the normal-vision separation floor. The shipped green
  clears it at dE 16.

### Generated artwork

The pipeline extracts no thumbnails. Rather than grey boxes, `Poster` derives a
stable gradient mesh and arc motif from an FNV-1a hash of the media id, with hues
pinned to the cyan-violet arc so generated art never collides with the reserved
status colours. The same title always renders the same art, which makes the
library scannable by shape and colour.

## Commands

```bash
npm run dev       # dev server with API proxy
npm run build     # typecheck then production build
npm run preview   # serve the production build
npm run lint      # oxlint
```
