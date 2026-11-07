import { useEffect, useState } from 'react'
import type { ErrorResponse } from '../shared/api'

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string> | undefined

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null
    throw new ApiError(
      res.status,
      body?.error.message ?? `Request failed: ${res.status}`,
      body?.error.fields,
    )
  }
  return (await res.json()) as T
}

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'ready'; data: T }

/**
 * Loads JSON from `url`. `retry` shows the loading state again; `refresh` keeps
 * current data on screen while refetching. Remount (via `key`) to change `url`.
 */
export function useApi<T>(url: string) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<T>(url, { signal: controller.signal }).then(
      (data) => setState({ status: 'ready', data }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'notFound' })
          return
        }
        console.error(err)
        setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [url, attempt])

  return {
    state,
    retry: () => {
      setState({ status: 'loading' })
      setAttempt((n) => n + 1)
    },
    refresh: () => setAttempt((n) => n + 1),
  }
}
