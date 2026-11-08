import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type {
  DueItemView,
  ErrorResponse,
  MileageSummary,
  MinderLogView,
  MinderResponse,
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
import {
  dueItems,
  minderCodes,
  minderLogs,
  odometerLogs,
  scheduleItems,
  services,
  vehicles,
} from './db/schema'
import { groupDueItems, mergeMinderStatus, parseMinderInput, resolveServices } from './minder'
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
    minderSince: null,
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

type VehicleRow = { id: number; name: string; scheduleModel: Vehicle['scheduleModel'] }

/** Schedule items, leftover Minder items, and attention counts per vehicle. */
async function statusByVehicle(db: Db, rows: VehicleRow[], today: string) {
  const ids = rows.map((v) => v.id)
  const items = ids.length
    ? await selectItems(db)
        .where(inArray(scheduleItems.vehicleId, ids))
        .orderBy(asc(services.name))
    : []
  const mileage = await mileageByVehicle(db, ids, today)
  const due = await dueItemsByVehicle(
    db,
    rows.filter((v) => v.scheduleModel === 'minder').map((v) => v.id),
  )
  return new Map(
    rows.map((v) => {
      const vehicleMileage = mileage.get(v.id) ?? null
      const views = items
        .filter((i) => i.vehicleId === v.id)
        .map((i) => toItemView(i, today, vehicleMileage?.estimate ?? null))
      const merged = mergeMinderStatus(views, due.get(v.id) ?? [])
      const vehicle: Vehicle = {
        ...v,
        mileage: vehicleMileage,
        attention: {
          soon: merged.items.filter((i) => i.status === 'soon').length,
          overdue:
            merged.items.filter((i) => i.status === 'overdue').length + merged.dueItems.length,
        },
      }
      return [v.id, { vehicle, ...merged }]
    }),
  )
}

const vehicleColumns = {
  id: vehicles.id,
  name: vehicles.name,
  scheduleModel: vehicles.scheduleModel,
}

app.get('/vehicles', async (c) => {
  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const rows = await db.select(vehicleColumns).from(vehicles).orderBy(asc(vehicles.id))
  const status = await statusByVehicle(db, rows, today)
  return c.json<VehiclesResponse>({ vehicles: rows.map((v) => status.get(v.id)!.vehicle) })
})

app.get('/vehicles/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const today = todayInEastern(new Date())
  const [row] = await db.select(vehicleColumns).from(vehicles).where(eq(vehicles.id, id))
  if (!row) return c.json(notFound('Vehicle not found'), 404)

  const { vehicle, items, dueItems } = (await statusByVehicle(db, [row], today)).get(id)!
  return c.json<VehicleDetailResponse>({ vehicle, today, items, dueItems })
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

  const [vehicle] = await db
    .select(vehicleColumns)
    .from(scheduleItems)
    .innerJoin(vehicles, eq(vehicles.id, scheduleItems.vehicleId))
    .where(eq(scheduleItems.id, id))
  const { items } = (await statusByVehicle(db, [vehicle], today)).get(vehicle.id)!
  return c.json<ScheduleItemResponse>({ item: items.find((i) => i.id === id)! })
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

async function findMinderVehicle(db: Db, id: number) {
  const [row] = await db
    .select({ id: vehicles.id, name: vehicles.name })
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.scheduleModel, 'minder')))
  return row
}

function selectOpenItems(db: Db) {
  return db
    .select({
      vehicleId: minderLogs.vehicleId,
      serviceName: services.name,
      logId: minderLogs.id,
      code: minderLogs.code,
      loggedAt: minderLogs.loggedAt,
    })
    .from(dueItems)
    .innerJoin(minderLogs, eq(minderLogs.id, dueItems.minderLogId))
    .innerJoin(services, eq(services.id, dueItems.serviceId))
}

async function dueItemsByVehicle(db: Db, vehicleIds: number[]) {
  const rows = vehicleIds.length
    ? await selectOpenItems(db).where(inArray(minderLogs.vehicleId, vehicleIds))
    : []
  return new Map<number, DueItemView[]>(
    vehicleIds.map((id) => [id, groupDueItems(rows.filter((r) => r.vehicleId === id))]),
  )
}

async function minderView(db: Db, vehicle: { id: number; name: string }, today: string) {
  const logs = await db
    .select({
      id: minderLogs.id,
      code: minderLogs.code,
      loggedAt: minderLogs.loggedAt,
      odometer: minderLogs.odometer,
    })
    .from(minderLogs)
    .where(eq(minderLogs.vehicleId, vehicle.id))
    .orderBy(desc(minderLogs.loggedAt), desc(minderLogs.id))
  const items = await selectOpenItems(db)
    .where(eq(minderLogs.vehicleId, vehicle.id))
    .orderBy(asc(services.name))
  const mileage = (await mileageByVehicle(db, [vehicle.id], today)).get(vehicle.id) ?? null
  return {
    vehicle,
    today,
    mileage,
    logs: logs.map(
      (log): MinderLogView => ({
        ...log,
        date: todayInEastern(new Date(log.loggedAt)),
        services: items.filter((i) => i.logId === log.id).map((i) => i.serviceName),
      }),
    ),
  } satisfies MinderResponse
}

app.get('/vehicles/:id/minder', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const vehicle = await findMinderVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)
  return c.json<MinderResponse>(await minderView(db, vehicle, todayInEastern(new Date())))
})

app.post('/vehicles/:id/minder', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const body: unknown = await c.req.json().catch(() => undefined)
  const parsed = parseMinderInput(body)
  const invalid = (fields: Record<string, string>) =>
    c.json<ErrorResponse>({ error: { message: 'Invalid code', fields } }, 400)
  if (!parsed.ok) return invalid(parsed.fields)

  const db = drizzle(c.env.DB)
  const vehicle = await findMinderVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)

  const lookup = await db
    .select({ code: minderCodes.code, kind: minderCodes.kind, serviceId: minderCodes.serviceId })
    .from(minderCodes)
  const resolved = resolveServices(parsed.value.code, lookup)
  if (!resolved.ok) return invalid({ code: resolved.message })

  // One batch is one transaction, so max(id) is the log inserted just above it.
  await db.batch([
    db.insert(minderLogs).values({
      vehicleId: id,
      code: parsed.value.code,
      loggedAt: new Date().toISOString(),
      odometer: parsed.value.odometer,
    }),
    db.insert(dueItems).values(
      resolved.serviceIds.map((serviceId) => ({
        minderLogId: sql<number>`(SELECT max(${minderLogs.id}) FROM ${minderLogs})`,
        serviceId,
      })),
    ),
  ])
  return c.json<MinderResponse>(await minderView(db, vehicle, todayInEastern(new Date())), 201)
})

app.delete('/minder-logs/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Minder log not found'), 404)

  const db = drizzle(c.env.DB)
  const [, deleted] = await db.batch([
    db.delete(dueItems).where(eq(dueItems.minderLogId, id)),
    db.delete(minderLogs).where(eq(minderLogs.id, id)).returning({ id: minderLogs.id }),
  ])
  if (deleted.length === 0) return c.json(notFound('Minder log not found'), 404)
  return c.body(null, 204)
})

app.notFound((c) => c.json<ErrorResponse>({ error: { message: 'Not found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json<ErrorResponse>({ error: { message: 'Something went wrong' } }, 500)
})

export default app
