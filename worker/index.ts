import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type { ErrorResponse, VehiclesResponse } from '../shared/api'
import { vehicles } from './db/schema'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))

app.get('/vehicles', async (c) => {
  const db = drizzle(c.env.DB)
  const rows = await db
    .select({ id: vehicles.id, name: vehicles.name, scheduleModel: vehicles.scheduleModel })
    .from(vehicles)
    .orderBy(asc(vehicles.id))
  return c.json<VehiclesResponse>({ vehicles: rows })
})

app.notFound((c) => c.json<ErrorResponse>({ error: { message: 'Not found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json<ErrorResponse>({ error: { message: 'Something went wrong' } }, 500)
})

export default app
