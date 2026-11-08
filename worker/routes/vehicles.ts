import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type {
  ErrorResponse,
  ScheduleItemResponse,
  VehicleDetailResponse,
  VehiclesResponse,
} from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import { parseBaselineInput } from '../baseline'
import { scheduleItems, vehicles } from '../db/schema'
import { notFound, parseId } from '../http'
import { statusByVehicle, vehicleColumns } from '../status'

export const vehicleRoutes = new Hono<{ Bindings: Env }>()

vehicleRoutes.get('/vehicles', async (c) => {
  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const rows = await db.select(vehicleColumns).from(vehicles).orderBy(asc(vehicles.id))
  const status = await statusByVehicle(db, rows, today)
  return c.json<VehiclesResponse>({ vehicles: rows.map((v) => status.get(v.id)!.vehicle) })
})

vehicleRoutes.get('/vehicles/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const [row] = await db.select(vehicleColumns).from(vehicles).where(eq(vehicles.id, id))
  if (!row) return c.json(notFound('Vehicle not found'), 404)

  const { vehicle, items, dueItems } = (await statusByVehicle(db, [row], today)).get(id)!
  return c.json<VehicleDetailResponse>({ vehicle, today, items, dueItems })
})

vehicleRoutes.put('/schedule-items/:id/baseline', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Schedule item not found'), 404)

  const today = todayInEastern(new Date())
  const body: unknown = await c.req.json().catch(() => undefined)
  const parsed = parseBaselineInput(body, today)
  if (!parsed.ok) {
    return c.json<ErrorResponse>(
      { error: { message: 'Invalid baseline', fields: parsed.fields } },
      400,
    )
  }

  const db = drizzle(c.env.DB)
  const updated = await db
    .update(scheduleItems)
    .set(parsed.value)
    .where(eq(scheduleItems.id, id))
    .returning({ id: scheduleItems.id })
  if (updated.length === 0) return c.json(notFound('Schedule item not found'), 404)

  const [vehicle] = await db
    .select(vehicleColumns)
    .from(scheduleItems)
    .innerJoin(vehicles, eq(vehicles.id, scheduleItems.vehicleId))
    .where(eq(scheduleItems.id, id))
  const { items } = (await statusByVehicle(db, [vehicle], today)).get(vehicle.id)!
  return c.json<ScheduleItemResponse>({ item: items.find((i) => i.id === id)! })
})
