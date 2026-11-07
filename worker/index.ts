import { asc, eq, inArray } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type {
  ErrorResponse,
  ScheduleItemResponse,
  ScheduleItemView,
  Vehicle,
  VehicleDetailResponse,
  VehiclesResponse,
} from '../shared/api'
import { computeDue, computeStatus, todayInEastern } from '../shared/schedule'
import { parseBaselineInput } from './baseline'
import { scheduleItems, services, vehicles } from './db/schema'

type Db = DrizzleD1Database

const app = new Hono<{ Bindings: Env }>().basePath('/api')

function parseId(raw: string): number | null {
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

function notFound(message: string) {
  return { error: { message } } satisfies ErrorResponse
}

// Current mileage arrives with odometer logging (feature 3); until then status is
// driven by dates only.
const CURRENT_MILES: number | null = null

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

function toItemView(row: ItemRow, today: string): ScheduleItemView {
  const due = computeDue(row)
  return {
    id: row.id,
    serviceName: row.serviceName,
    intervalMiles: row.intervalMiles,
    intervalMonths: row.intervalMonths,
    baselineDate: row.baselineDate,
    baselineOdometer: row.baselineOdometer,
    ...due,
    status: computeStatus(due, today, CURRENT_MILES),
  }
}

function selectItems(db: Db) {
  return db
    .select(itemColumns)
    .from(scheduleItems)
    .innerJoin(services, eq(services.id, scheduleItems.serviceId))
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

  const result: Vehicle[] = rows.map((v) => {
    if (v.scheduleModel !== 'interval') return { ...v, attention: null }
    const statuses = items
      .filter((i) => i.vehicleId === v.id)
      .map((i) => toItemView(i, today).status)
    return {
      ...v,
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

  const items =
    row.scheduleModel === 'interval'
      ? (
          await selectItems(db).where(eq(scheduleItems.vehicleId, id)).orderBy(asc(services.name))
        ).map((i) => toItemView(i, today))
      : []

  const vehicle: Vehicle = {
    ...row,
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
  return c.json<ScheduleItemResponse>({ item: toItemView(row, today) })
})

app.notFound((c) => c.json<ErrorResponse>({ error: { message: 'Not found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json<ErrorResponse>({ error: { message: 'Something went wrong' } }, 500)
})

export default app
