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
