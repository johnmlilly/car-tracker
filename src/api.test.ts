import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitJson } from './api'

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('submitJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends JSON and returns data on success', async () => {
    const fetchMock = stubFetch(() => json(201, { id: 7 }))
    const result = await submitJson<{ id: number }>('/api/things', 'POST', { a: 1 })
    expect(result).toEqual({ ok: true, data: { id: 7 } })
    expect(fetchMock).toHaveBeenCalledWith('/api/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    })
  })

  it('returns field messages for a 400', async () => {
    stubFetch(() => json(400, { error: { message: 'Invalid', fields: { date: 'Bad date.' } } }))
    expect(await submitJson('/api/things', 'PUT', {})).toEqual({
      ok: false,
      fields: { date: 'Bad date.' },
    })
  })

  it.each([
    ['a 400 without fields', () => json(400, { error: { message: 'Invalid' } }), 400],
    ['a 404', () => json(404, { error: { message: 'Not found' } }), 404],
    ['a 500', () => json(500, { error: { message: 'Something went wrong' } }), 500],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), null],
  ])('returns a generic error for %s', async (_name, impl, status) => {
    stubFetch(impl)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await submitJson('/api/things', 'POST', {})).toEqual({
      ok: false,
      error: "Couldn't save. Try again.",
      status,
    })
  })
})
