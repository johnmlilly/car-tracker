import { describe, expect, it } from 'vitest'
import app from './index'

describe('worker API', () => {
  it('reports health', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns the error shape for unknown API paths', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { message: 'Not found' } })
  })

  it('hides internal errors behind a generic 500', async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error('database unavailable')
      },
    } as unknown as D1Database
    const res = await app.request('/api/vehicles', {}, { DB: brokenDb })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { message: 'Something went wrong' } })
  })
})

describe('GET /api/vehicles/:id', () => {
  const unusedDb = {} as D1Database

  it.each(['abc', '0', '-1', '1.5', '01'])('returns 404 for invalid id %s', async (id) => {
    const res = await app.request(`/api/vehicles/${id}`, {}, { DB: unusedDb })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { message: 'Vehicle not found' } })
  })
})

describe('PUT /api/schedule-items/:id/baseline', () => {
  const unusedDb = {} as D1Database
  const put = (id: string, body: string) =>
    app.request(
      `/api/schedule-items/${id}/baseline`,
      { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } },
      { DB: unusedDb },
    )

  it('returns 404 for an invalid id', async () => {
    const res = await put('nope', '{}')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { message: 'Schedule item not found' } })
  })

  it('returns 400 with field messages for invalid input', async () => {
    const res = await put('1', JSON.stringify({ baselineDate: '2999-01-01', baselineOdometer: -5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: { message: string; fields: Record<string, string> }
    }
    expect(body.error.message).toBe('Invalid baseline')
    expect(Object.keys(body.error.fields).sort()).toEqual(['baselineDate', 'baselineOdometer'])
  })

  it('returns 400 for a body that is not JSON', async () => {
    const res = await put('1', 'not json')
    expect(res.status).toBe(400)
  })
})

describe('odometer routes', () => {
  const unusedDb = {} as D1Database
  const post = (id: string, body: string) =>
    app.request(
      `/api/vehicles/${id}/odometer`,
      { method: 'POST', body, headers: { 'Content-Type': 'application/json' } },
      { DB: unusedDb },
    )

  it.each(['abc', '0', '01'])('GET returns 404 for invalid vehicle id %s', async (id) => {
    const res = await app.request(`/api/vehicles/${id}/odometer`, {}, { DB: unusedDb })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { message: 'Vehicle not found' } })
  })

  it('POST returns 404 for an invalid vehicle id', async () => {
    const res = await post('x', JSON.stringify({ date: '2026-01-01', odometer: 1 }))
    expect(res.status).toBe(404)
  })

  it('POST returns 400 with field messages for invalid input', async () => {
    const res = await post('1', JSON.stringify({ date: '2999-01-01', odometer: -5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: { message: string; fields: Record<string, string> }
    }
    expect(body.error.message).toBe('Invalid reading')
    expect(Object.keys(body.error.fields).sort()).toEqual(['date', 'odometer'])
  })

  it('POST returns 400 for a body that is not JSON', async () => {
    const res = await post('1', 'not json')
    expect(res.status).toBe(400)
  })

  it('DELETE returns 404 for an invalid id', async () => {
    const res = await app.request('/api/odometer-logs/-3', { method: 'DELETE' }, { DB: unusedDb })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { message: 'Reading not found' } })
  })
})
