# Event-Driven Media Platform

Three services:
- **media-api**: REST API with JWT authentication, stores metadata in Postgres, publishes Kafka events, and streams live pipeline events to browsers over SSE.
- **media-worker**: consumes Kafka events, runs FFmpeg to produce HLS, uploads to MinIO, updates Postgres, publishes progress/completion/failure events.
- **media-web**: React front-end - library, upload, HLS playback, and a live Kafka observability dashboard. See [media-web/README.md](media-web/README.md).

## Architecture

```
media-web (React + Vite, nginx in Docker)
  | REST over /api
  | SSE  /api/stream/events   - this user's media
  | SSE  /api/stream/firehose - anonymized cluster-wide flow
  v
media-api (Spring Boot + Spring Security)
  | Postgres: users / media / jobs / renditions
  | Kafka: media.uploaded
  | AdminClient: cluster, topic and consumer group state
  v
Kafka
  v
media-worker (Spring Boot)
  | downloads raw from MinIO
  | FFmpeg -> HLS (720p + 480p)
  | uploads HLS to MinIO
  | updates Postgres + emits progress
  v
MinIO (bucket: media)
```

The API consumes `media.transcode.progress`, `media.processed` and
`media.failed` in a **separate, per-instance consumer group** and fans those
records out to connected browsers. Fan-out never competes with the persistence
listener for records, and a broken UI client can never stall the pipeline or
push a record toward the DLT.

## Run

Prereqs: Docker Desktop.

```bash
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:8080
- Kafka UI: http://localhost:8088
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## Authentication

All media endpoints require JWT authentication. First register or login to get a token.

### Register

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzUxMiJ9...",
  "username": "testuser",
  "email": "test@example.com"
}
```

### Login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

Response: Same as registration (returns a new token).

## Test Flow (curl)

**Note:** Replace `<TOKEN>` with the JWT token from registration/login.

1) Init upload
```bash
curl -s -X POST http://localhost:8080/api/media/init-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"title":"demo","type":"VIDEO","filename":"input.mp4","contentType":"video/mp4"}'
```

2) Upload file (multipart)
```bash
curl -s -X PUT "http://localhost:8080/api/media/<mediaId>/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@./input.mp4"
```

3) Complete upload (kicks off processing)
```bash
curl -s -X POST http://localhost:8080/api/media/<mediaId>/complete-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"objectKey":"raw/<mediaId>/input.mp4"}'
```

4) Poll status
```bash
curl -s http://localhost:8080/api/media/<mediaId>/status \
  -H "Authorization: Bearer <TOKEN>"
```

5) Get playback URL (proxy)
```bash
curl -s http://localhost:8080/api/media/<mediaId>/play \
  -H "Authorization: Bearer <TOKEN>"
```

Open the returned `hlsUrl` in VLC.

## Live and Observability Endpoints

These back the front-end and require the same JWT.

| Endpoint | What it returns |
| --- | --- |
| `GET /api/stream/events` | SSE - progress, processed and failed events for the caller's own media |
| `GET /api/stream/firehose` | SSE - the same flow with media identifiers stripped, for the ops view |
| `GET /api/ops/kafka` | Cluster nodes, `media.*` topic partitions with start/end offsets, and every consumer group with state, members and per-topic lag |
| `GET /api/ops/pipeline` | The caller's media counts by status, rendition totals, mean processing duration, 24h completion buckets |
| `GET /api/ops/recent-events` | The anonymized replay buffer, so a freshly loaded dashboard is not blank |

Browsers cannot attach an `Authorization` header to an `EventSource`, so the two
SSE paths - and only those - also accept the token as an `access_token` query
parameter.

`/api/ops/kafka` is served from a 1.5s cache behind a 5s AdminClient timeout: a
fast-polling dashboard cannot hammer the broker, and an unreachable broker
returns `reachable: false` rather than throwing.

## Object Layout

Bucket: `media`
- `raw/<mediaId>/<filename>`
- `hls/<mediaId>/master.m3u8`
- `hls/<mediaId>/720p/index.m3u8` + segments
- `hls/<mediaId>/480p/index.m3u8` + segments

## Tech Stack

- **Backend**: Spring Boot 3.5.10, Java 25
- **Front-end**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, hls.js
- **Security**: Spring Security, JWT (JJWT 0.12.6)
- **Database**: PostgreSQL 15, Flyway migrations
- **Messaging**: Apache Kafka
- **Storage**: MinIO (S3-compatible)
- **Processing**: FFmpeg (video transcoding)
- **Containerization**: Docker, Docker Compose
