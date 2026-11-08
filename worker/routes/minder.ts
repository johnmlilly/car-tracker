import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type { ErrorResponse, MinderLogView, MinderResponse } from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import { dueItems, minderCodes, minderLogs, services, vehicles } from '../db/schema'
import { type Db, notFound, parseId } from '../http'
import { parseMinderInput, resolveServices } from '../minder'
import { mileageByVehicle, selectDueItems } from '../status'

export const minderRoutes = new Hono<{ Bindings: Env }>()

async function findMinderVehicle(db: Db, id: number) {
  const [row] = await db
    .select({ id: vehicles.id, name: vehicles.name })
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.scheduleModel, 'minder')))
  return row
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
  // Every service a code opened, closed or not, so history doesn't shrink after service.
  const items = await selectDueItems(db)
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

minderRoutes.get('/vehicles/:id/minder', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const vehicle = await findMinderVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)
  return c.json<MinderResponse>(await minderView(db, vehicle, todayInEastern(new Date())))
})

minderRoutes.post('/vehicles/:id/minder', async (c) => {
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

minderRoutes.delete('/minder-logs/:id', async (c) => {
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
