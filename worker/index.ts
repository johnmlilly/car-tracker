import { asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type {
  ErrorResponse,
  MileageSummary,
  OdometerResponse,
  ScheduleItemResponse,
  ScheduleItemView,
  Vehicle,
  VehicleDetailResponse,
  VehiclesResponse,
} from '../shared/api'
import { estimateMileage } from '../shared/mileage'
import { computeDue, computeStatus, todayInEastern } from '../shared/schedule'
import { parseBaselineInput } from './baseline'
import { odometerLogs, scheduleItems, services, vehicles } from './db/schema'
import { findConflict, parseOdometerInput } from './odometer'

type Db = DrizzleD1Database

const app = new Hono<{ Bindings: Env }>().basePath('/api')

function parseId(raw: string): number | null {
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

function notFound(message: string) {
  return { error: { message } } satisfies ErrorResponse
}

const itemColumns = {
  id: scheduleItems.id,
  vehicleId: scheduleItems.vehicleId,
  serviceName: services.name,
  intervalMiles: scheduleItems.intervalMiles,
  intervalMonths: scheduleItems.intervalMonths,
  baselineDate: scheduleItems.baselineDate,
  baselineOdometer: scheduleItems.baselineOdometer,
}

type ItemRow = {
  id: number
  vehicleId: number
  serviceName: string
  intervalMiles: number | null
  intervalMonths: number | null
  baselineDate: string | null
  baselineOdometer: number | null
}

function toItemView(row: ItemRow, today: string, currentMiles: number | null): ScheduleItemView {
  const due = computeDue(row)
  return {
    id: row.id,
    serviceName: row.serviceName,
    intervalMiles: row.intervalMiles,
    intervalMonths: row.intervalMonths,
    baselineDate: row.baselineDate,
    baselineOdometer: row.baselineOdometer,
    ...due,
    status: computeStatus(due, today, currentMiles),
  }
}

function selectItems(db: Db) {
  return db
    .select(itemColumns)
    .from(scheduleItems)
    .innerJoin(services, eq(services.id, scheduleItems.serviceId))
}

async function mileageByVehicle(db: Db, vehicleIds: number[], today: string) {
  const rows = vehicleIds.length
    ? await db
        .select({
          vehicleId: odometerLogs.vehicleId,
          date: odometerLogs.date,
          odometer: odometerLogs.odometer,
        })
        .from(odometerLogs)
        .where(inArray(odometerLogs.vehicleId, vehicleIds))
    : []
  return new Map<number, MileageSummary | null>(
    vehicleIds.map((id) => [
      id,
      estimateMileage(
        rows.filter((r) => r.vehicleId === id),
        today,
      ),
    ]),
  )
}

app.get('/health', (c) => c.json({ ok: true }))

app.get('/vehicles', async (c) => {
  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const rows = await db
    .select({ id: vehicles.id, name: vehicles.name, scheduleModel: vehicles.scheduleModel })
    .from(vehicles)
    .orderBy(asc(vehicles.id))

  const intervalIds = rows.filter((v) => v.scheduleModel === 'interval').map((v) => v.id)
  const items = intervalIds.length
    ? await selectItems(db).where(inArray(scheduleItems.vehicleId, intervalIds))
    : []
  const mileage = await mileageByVehicle(
    db,
    rows.map((v) => v.id),
    today,
  )

  const result: Vehicle[] = rows.map((v) => {
    const vehicleMileage = mileage.get(v.id) ?? null
    if (v.scheduleModel !== 'interval') return { ...v, attention: null, mileage: vehicleMileage }
    const currentMiles = vehicleMileage?.estimate ?? null
    const statuses = items
      .filter((i) => i.vehicleId === v.id)
      .map((i) => toItemView(i, today, currentMiles).status)
    return {
      ...v,
      mileage: vehicleMileage,
      attention: {
        soon: statuses.filter((s) => s === 'soon').length,
        overdue: statuses.filter((s) => s === 'overdue').length,
      },
    }
  })
  return c.json<VehiclesResponse>({ vehicles: result })
})

app.get('/vehicles/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const [row] = await db
    .select({ id: vehicles.id, name: vehicles.name, scheduleModel: vehicles.scheduleModel })
    .from(vehicles)
    .where(eq(vehicles.id, id))
  if (!row) return c.json(notFound('Vehicle not found'), 404)

  const mileage = (await mileageByVehicle(db, [id], today)).get(id) ?? null
  const items =
    row.scheduleModel === 'interval'
      ? (
          await selectItems(db).where(eq(scheduleItems.vehicleId, id)).orderBy(asc(services.name))
        ).map((i) => toItemView(i, today, mileage?.estimate ?? null))
      : []

  const vehicle: Vehicle = {
    ...row,
    mileage,
    attention:
      row.scheduleModel === 'interval'
        ? {
            soon: items.filter((i) => i.status === 'soon').length,
            overdue: items.filter((i) => i.status === 'overdue').length,
          }
        : null,
  }
  return c.json<VehicleDetailResponse>({ vehicle, today, items })
})

app.put('/schedule-items/:id/baseline', async (c) => {
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

  const [row] = await selectItems(db).where(eq(scheduleItems.id, id))
  const mileage = (await mileageByVehicle(db, [row.vehicleId], today)).get(row.vehicleId)
  return c.json<ScheduleItemResponse>({
    item: toItemView(row, today, mileage?.estimate ?? null),
  })
})

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

async function findVehicle(db: Db, id: number) {
  const [row] = await db
    .select({ id: vehicles.id, name: vehicles.name })
    .from(vehicles)
    .where(eq(vehicles.id, id))
  return row
}

app.get('/vehicles/:id/odometer', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const vehicle = await findVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)
  return c.json<OdometerResponse>(await odometerView(db, vehicle, todayInEastern(new Date())))
})

app.post('/vehicles/:id/odometer', async (c) => {
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

app.delete('/odometer-logs/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Reading not found'), 404)

  const db = drizzle(c.env.DB)
  const deleted = await db
    .delete(odometerLogs)
    .where(eq(odometerLogs.id, id))
    .returning({ id: odometerLogs.id })
  if (deleted.length === 0) return c.json(notFound('Reading not found'), 404)
  return c.body(null, 204)
})

app.notFound((c) => c.json<ErrorResponse>({ error: { message: 'Not found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json<ErrorResponse>({ error: { message: 'Something went wrong' } }, 500)
})

export default app
