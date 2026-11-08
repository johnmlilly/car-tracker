import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type { ErrorResponse, OdometerResponse } from '../../shared/api'
import { estimateMileage } from '../../shared/mileage'
import { todayInEastern } from '../../shared/schedule'
import { odometerLogs } from '../db/schema'
import { type Db, findVehicle, notFound, parseId } from '../http'
import { findConflict, parseOdometerInput } from '../odometer'

export const odometerRoutes = new Hono<{ Bindings: Env }>()

async function odometerView(db: Db, vehicle: { id: number; name: string }, today: string) {
  const readings = await db
    .select({
      id: odometerLogs.id,
      date: odometerLogs.date,
      odometer: odometerLogs.odometer,
      source: odometerLogs.source,
    })
    .from(odometerLogs)
    .where(eq(odometerLogs.vehicleId, vehicle.id))
    .orderBy(desc(odometerLogs.date), desc(odometerLogs.odometer), desc(odometerLogs.id))
  return {
    vehicle,
    today,
    mileage: estimateMileage(readings, today),
    readings,
  } satisfies OdometerResponse
}

odometerRoutes.get('/vehicles/:id/odometer', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const vehicle = await findVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)
  return c.json<OdometerResponse>(await odometerView(db, vehicle, todayInEastern(new Date())))
})

odometerRoutes.post('/vehicles/:id/odometer', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const today = todayInEastern(new Date())
  const body: unknown = await c.req.json().catch(() => undefined)
  const parsed = parseOdometerInput(body, today)
  const invalid = (fields: Record<string, string>) =>
    c.json<ErrorResponse>({ error: { message: 'Invalid reading', fields } }, 400)
  if (!parsed.ok) return invalid(parsed.fields)

  const db = drizzle(c.env.DB)
  const vehicle = await findVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)

  const existing = await db
    .select({ date: odometerLogs.date, odometer: odometerLogs.odometer })
    .from(odometerLogs)
    .where(eq(odometerLogs.vehicleId, id))
  const conflict = findConflict(existing, parsed.value)
  if (conflict) return invalid({ odometer: conflict })

  await db.insert(odometerLogs).values({ vehicleId: id, ...parsed.value, source: 'manual' })
  return c.json<OdometerResponse>(await odometerView(db, vehicle, today), 201)
})

odometerRoutes.delete('/odometer-logs/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Reading not found'), 404)

  const db = drizzle(c.env.DB)
  const deleted = await db
    .delete(odometerLogs)
    .where(and(eq(odometerLogs.id, id), eq(odometerLogs.source, 'manual')))
    .returning({ id: odometerLogs.id })
  if (deleted.length > 0) return c.body(null, 204)

  const [owned] = await db
    .select({ id: odometerLogs.id })
    .from(odometerLogs)
    .where(eq(odometerLogs.id, id))
  if (!owned) return c.json(notFound('Reading not found'), 404)
  return c.json<ErrorResponse>(
    {
      error: {
        message: 'This reading comes from a service record. Delete the record instead.',
      },
    },
    409,
  )
})
