import type {
  ApiErrorBody,
  MeResponse,
  SearchResponse,
  ServerConfigResponse,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Ошибка ${res.status}`
  try {
    const body = (await res.json()) as ApiErrorBody
    message = body.error || body.message || message
  } catch {
    /* ignore */
  }
  if (res.status === 401) message = 'Нужна авторизация или неверный логин/пароль'
  if (res.status === 403) message = message || 'Нет доступа'
  if (res.status === 502) message = message || 'Сервер Ирбис недоступен или вернул ошибку'
  return new ApiError(res.status, message)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  login(username: string, password: string, workstation?: string) {
    return request<MeResponse>('/v1/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, workstation: workstation || undefined }),
    })
  },

  logout() {
    return request<void>('/v1/logout', { method: 'POST' })
  },

  me() {
    return request<MeResponse>('/v1/me')
  },

  config() {
    return request<ServerConfigResponse>('/v1/config')
  },

  search(
    database: string,
    body: {
      expression?: string
      mode?: string
      value?: string
      limit?: number
      offset?: number
      with_records?: boolean
      format?: string
    },
  ) {
    return request<SearchResponse>(
      `/v1/databases/${encodeURIComponent(database)}/records/search`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  listPrintTemplates() {
    return request<{ templates: string[] }>('/v1/print/templates')
  },

  async print(
    database: string,
    body: {
      template: string
      mfns: number[]
      extras?: Record<string, string>
      filename?: string
    },
  ): Promise<{ blob: Blob; filename: string }> {
    const res = await fetch(`/v1/databases/${encodeURIComponent(database)}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await parseError(res)
    const cd = res.headers.get('Content-Disposition') || ''
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd)
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : `${body.filename || body.template}.rtf`
    const blob = await res.blob()
    return { blob, filename }
  },
}
