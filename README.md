# Event-Driven Media Platform (MVP)

Two services:
- **media-api**: REST API with JWT authentication, stores metadata in Postgres, publishes Kafka events.
- **media-worker**: consumes Kafka events, runs FFmpeg to produce HLS, uploads to MinIO, updates Postgres, publishes progress/completion/failure events.

## Architecture (MVP)

```
Client
  | register/login (get JWT token)
  | init-upload + upload + complete (with JWT)
  v
media-api (Spring Boot + Spring Security)
  | Postgres: users / media / jobs / renditions
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

## Object Layout

Bucket: `media`
- `raw/<mediaId>/<filename>`
- `hls/<mediaId>/master.m3u8`
- `hls/<mediaId>/720p/index.m3u8` + segments
- `hls/<mediaId>/480p/index.m3u8` + segments

## Tech Stack

- **Backend**: Spring Boot 3.5.10, Java 25
- **Security**: Spring Security, JWT (JJWT 0.12.6)
- **Database**: PostgreSQL 15, Flyway migrations
- **Messaging**: Apache Kafka
- **Storage**: MinIO (S3-compatible)
- **Processing**: FFmpeg (video transcoding)
- **Containerization**: Docker, Docker Compose
