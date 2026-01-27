# Event-Driven Media Platform (MVP)

Two services:
- **media-api**: REST API, stores metadata in Postgres, publishes Kafka events.
- **media-worker**: consumes Kafka events, runs FFmpeg to produce HLS, uploads to MinIO, updates Postgres, publishes progress/completion/failure events.

## Architecture (MVP)

```
Client
  | init-upload + upload + complete
  v
media-api (Spring Boot)
  | Postgres: media / jobs / renditions
  | Kafka: media.uploaded
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

## Run

Prereqs: Docker Desktop.

```bash
docker compose up --build
```

- API: http://localhost:8080
- Kafka UI: http://localhost:8088
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## Test Flow (curl)

1) Init upload
```bash
curl -s -X POST http://localhost:8080/api/media/init-upload \
  -H "Content-Type: application/json" \
  -d '{"title":"demo","type":"VIDEO","filename":"input.mp4","contentType":"video/mp4"}'
```

2) Upload file (multipart)
```bash
curl -s -X PUT "http://localhost:8080/api/media/<mediaId>/upload" \
  -F "file=@./input.mp4"
```

3) Complete upload (kicks off processing)
```bash
curl -s -X POST http://localhost:8080/api/media/<mediaId>/complete-upload \
  -H "Content-Type: application/json" \
  -d '{"objectKey":"raw/<mediaId>/input.mp4"}'
```

4) Poll status
```bash
curl -s http://localhost:8080/api/media/<mediaId>/status
```

5) Get playback URL (proxy)
```bash
curl -s http://localhost:8080/api/media/<mediaId>/play
```

Open the returned `hlsUrl` in VLC.

## Object Layout

Bucket: `media`
- `raw/<mediaId>/<filename>`
- `hls/<mediaId>/master.m3u8`
- `hls/<mediaId>/720p/index.m3u8` + segments
- `hls/<mediaId>/480p/index.m3u8` + segments
