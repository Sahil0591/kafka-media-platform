import type {
  AuthResponse,
  InitUploadResponse,
  KafkaSnapshot,
  MediaStatusDetail,
  MediaSummary,
  MediaType,
  PipelineStats,
  Profile,
  Rendition,
  StreamEvent,
} from './types'

const TOKEN_KEY = 'aperture.token'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  get isUnauthorized() {
    return this.status === 401 || this.status === 403
  }
}

// ── token storage ────────────────────────────────────────────────────────────
// Kept in module scope with a localStorage mirror so a page reload restores the
// session without a round trip.

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken() {
  return token
}

export function setToken(next: string | null) {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Invoked whenever the API rejects our credentials, so the shell can sign out. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

// ── core request ─────────────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the API. Is media-api running?')
  }

  if (response.status === 401 || response.status === 403) {
    // Do not tear down the session for an ownership rejection on a single item.
    if (response.status === 401) onUnauthorized?.()
    throw new ApiError(response.status, await errorMessage(response, 'Not authorized'))
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response, `Request failed (${response.status})`))
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Spring's error body carries a useful `message`; fall back gracefully. */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return fallback
    const body = JSON.parse(text)
    return body.message || body.error || body.detail || fallback
  } catch {
    return fallback
  }
}

// ── endpoints ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),

    register: (username: string, email: string, password: string) =>
      request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
  },

  users: {
    me: () => request<Profile>('/users/me'),

    updateProfile: (body: { username?: string; email?: string }) =>
      request<AuthResponse>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<AuthResponse>('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },

  media: {
    list: () => request<MediaSummary[]>('/media'),

    status: (id: string) => request<MediaStatusDetail>(`/media/${id}/status`),

    renditions: (id: string) => request<Rendition[]>(`/media/${id}/renditions`),

    play: (id: string) => request<{ hlsUrl: string }>(`/media/${id}/play`),

    download: (id: string) => request<{ downloadUrl: string }>(`/media/${id}/download`),

    rename: (id: string, title: string) =>
      request<MediaSummary>(`/media/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),

    remove: (id: string) => request<{ status: string }>(`/media/${id}`, { method: 'DELETE' }),

    initUpload: (body: { title: string; type: MediaType; filename: string; contentType: string }) =>
      request<InitUploadResponse>('/media/init-upload', { method: 'POST', body: JSON.stringify(body) }),

    completeUpload: (id: string, objectKey: string, contentType: string) =>
      request<{ status: string }>(`/media/${id}/complete-upload`, {
        method: 'POST',
        body: JSON.stringify({ objectKey, contentType }),
      }),

    /**
     * Multipart PUT via XMLHttpRequest rather than fetch - only XHR exposes
     * upload progress events, and the byte-level progress bar depends on them.
     */
    uploadFile: (
      id: string,
      file: File,
      onProgress?: (fraction: number) => void,
      signal?: AbortSignal,
    ): Promise<{ objectKey: string; size: number }> =>
      new Promise((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)

        const xhr = new XMLHttpRequest()
        xhr.open('PUT', `/api/media/${id}/upload`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(event.loaded / event.total)
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(1)
            resolve(xhr.responseText ? JSON.parse(xhr.responseText) : { objectKey: '', size: file.size })
          } else {
            let message = `Upload failed (${xhr.status})`
            try {
              message = JSON.parse(xhr.responseText).message ?? message
            } catch {
              // Response was not JSON; the status-based message stands.
            }
            reject(new ApiError(xhr.status, message))
          }
        }

        xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'))
        xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'))
        signal?.addEventListener('abort', () => xhr.abort(), { once: true })

        xhr.send(form)
      }),
  },

  ops: {
    kafka: () => request<KafkaSnapshot>('/ops/kafka'),
    pipeline: () => request<PipelineStats>('/ops/pipeline'),
    recentEvents: () => request<StreamEvent[]>('/ops/recent-events'),
  },
}

/**
 * SSE URL builder. EventSource cannot set headers, so the API accepts the JWT
 * as a query parameter on these paths only.
 */
export function streamUrl(channel: 'events' | 'firehose'): string {
  return `/api/stream/${channel}?access_token=${encodeURIComponent(token ?? '')}`
}
