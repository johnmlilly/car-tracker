import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VehiclesResponse } from '../../shared/api'
import app from '../index'
import { startPlatform } from '../test/platform'

let env: Env
let dispose: () => Promise<void>

beforeEach(async () => {
  ;({ env, dispose } = await startPlatform())
})

afterEach(async () => {
  await dispose()
})

async function vehicles(): Promise<VehiclesResponse['vehicles']> {
  const res = await app.request('/api/vehicles', {}, env)
  expect(res.status).toBe(200)
  return ((await res.json()) as VehiclesResponse).vehicles
}

describe('GET /api/vehicles nextDue', () => {
  it('is null when no item has a baseline', async () => {
    for (const v of await vehicles()) expect(v.nextDue).toBeNull()
  })

  it('names the most urgent item for a vehicle', async () => {
    const corolla = (await vehicles()).find((v) => v.name === '2019 Toyota Corolla')!
    const { results } = await env.DB.prepare(
      `SELECT si.id AS id, s.name AS name FROM schedule_items si
       JOIN services s ON s.id = si.service_id WHERE si.vehicle_id = ?`,
    )
      .bind(corolla.id)
      .all<{ id: number; name: string }>()
    const tire = results.find((r) => r.name === 'Tire rotation')!
    const brake = results.find((r) => r.name === 'Brake fluid')!
    await env.DB.prepare(
      `UPDATE schedule_items SET baseline_date = '2000-01-01' WHERE id = ?`,
    ).bind(tire.id).run()
    await env.DB.prepare(
      `UPDATE schedule_items SET baseline_date = date('now', '-1 day') WHERE id = ?`,
    ).bind(brake.id).run()

    const next = (await vehicles()).find((v) => v.id === corolla.id)!.nextDue
    expect(next).toMatchObject({ serviceName: 'Tire rotation', status: 'overdue', minder: null })
    expect(next?.countdown).toMatchObject({ kind: 'days' })
  })
})
