import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startPlatform } from '../test/platform'

let env: Env
let dispose: () => Promise<void>

beforeEach(async () => {
  ;({ env, dispose } = await startPlatform())
})

afterEach(async () => {
  await dispose()
})

describe('migrations', () => {
  it('gives the Corolla, and only the Corolla, a transmission fluid schedule', async () => {
    const { results } = await env.DB.prepare(
      `SELECT v.name AS vehicle, si.interval_miles AS miles, si.interval_months AS months
       FROM schedule_items si
       JOIN vehicles v ON v.id = si.vehicle_id
       JOIN services s ON s.id = si.service_id
       WHERE s.name = 'Transmission fluid'`,
    ).all()
    expect(results).toEqual([{ vehicle: '2019 Toyota Corolla', miles: 60_000, months: 72 }])
  })
})
