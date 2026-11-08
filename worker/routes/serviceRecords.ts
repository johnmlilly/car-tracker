import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type { ErrorResponse, ServiceRecordView, ServiceRecordsResponse } from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import {
  dueItems,
  minderLogs,
  odometerLogs,
  serviceItems,
  serviceRecords,
  services,
} from '../db/schema'
import { type Db, findVehicle, notFound, parseId } from '../http'
import { findConflict } from '../odometer'
import {
  parseServiceRecordInput,
  reassignClosures,
  selectDueItemsToClose,
} from '../serviceRecord'
import { isOpen, selectDueItems } from '../status'

export const serviceRecordRoutes = new Hono<{ Bindings: Env }>()

async function serviceRecordsView(
  db: Db,
  vehicle: { id: number; name: string },
  today: string,
): Promise<ServiceRecordsResponse> {
  const serviceList = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .orderBy(asc(services.name))
  const records = await db
    .select({
      id: serviceRecords.id,
      date: serviceRecords.date,
      odometer: serviceRecords.odometer,
      shop: serviceRecords.shop,
      totalCents: serviceRecords.totalCents,
      source: serviceRecords.source,
    })
    .from(serviceRecords)
    .where(eq(serviceRecords.vehicleId, vehicle.id))
    .orderBy(desc(serviceRecords.date), desc(serviceRecords.id))
  const items = records.length
    ? await db
        .select({
          id: serviceItems.id,
          serviceRecordId: serviceItems.serviceRecordId,
          description: serviceItems.description,
          serviceId: serviceItems.serviceId,
          serviceName: services.name,
          amountCents: serviceItems.amountCents,
        })
        .from(serviceItems)
        // Join on the vehicle, not an id list: D1 caps bound parameters per query.
        .innerJoin(serviceRecords, eq(serviceRecords.id, serviceItems.serviceRecordId))
        .leftJoin(services, eq(services.id, serviceItems.serviceId))
        .where(eq(serviceRecords.vehicleId, vehicle.id))
        .orderBy(asc(serviceItems.id))
    : []
  return {
    vehicle,
    today,
    services: serviceList,
    records: records.map(
      (record): ServiceRecordView => ({
        ...record,
        items: items
          .filter((i) => i.serviceRecordId === record.id)
          .map((i) => ({
            id: i.id,
            description: i.description,
            serviceId: i.serviceId,
            serviceName: i.serviceName,
            amountCents: i.amountCents,
          })),
      }),
    ),
  }
}

serviceRecordRoutes.get('/vehicles/:id/service-records', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const db = drizzle(c.env.DB)
  const vehicle = await findVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)
  return c.json<ServiceRecordsResponse>(
    await serviceRecordsView(db, vehicle, todayInEastern(new Date())),
  )
})

serviceRecordRoutes.post('/vehicles/:id/service-records', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Vehicle not found'), 404)

  const today = todayInEastern(new Date())
  const body: unknown = await c.req.json().catch(() => undefined)
  const parsed = parseServiceRecordInput(body, today)
  const invalid = (fields: Record<string, string>) =>
    c.json<ErrorResponse>({ error: { message: 'Invalid service record', fields } }, 400)
  if (!parsed.ok) return invalid(parsed.fields)
  const input = parsed.value

  const db = drizzle(c.env.DB)
  const vehicle = await findVehicle(db, id)
  if (!vehicle) return c.json(notFound('Vehicle not found'), 404)

  const known = new Set((await db.select({ id: services.id }).from(services)).map((s) => s.id))
  const unknownFields: Record<string, string> = {}
  input.items.forEach((item, index) => {
    if (item.serviceId !== null && !known.has(item.serviceId)) {
      unknownFields[`items.${index}.serviceId`] = 'Pick a service from the list.'
    }
  })

  if (input.odometer !== null) {
    const existing = await db
      .select({ date: odometerLogs.date, odometer: odometerLogs.odometer })
      .from(odometerLogs)
      .where(eq(odometerLogs.vehicleId, id))
    const conflict = findConflict(existing, { date: input.date, odometer: input.odometer })
    if (conflict) unknownFields.odometer = conflict
  }
  if (Object.keys(unknownFields).length > 0) return invalid(unknownFields)

  const openRows = await selectDueItems(db).where(and(eq(minderLogs.vehicleId, id), isOpen))
  const toClose = selectDueItemsToClose(
    openRows,
    input.items.map((i) => i.serviceId),
    input.date,
  )

  // One batch is one transaction, so max(id) is the record inserted first.
  const recordId = sql<number>`(SELECT max(${serviceRecords.id}) FROM ${serviceRecords})`
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(serviceRecords).values({
      vehicleId: id,
      date: input.date,
      odometer: input.odometer,
      shop: input.shop,
      totalCents: input.totalCents,
      source: 'manual',
    }),
    db.insert(serviceItems).values(
      input.items.map((item) => ({ ...item, serviceRecordId: recordId })),
    ),
  ]
  if (input.odometer !== null) {
    statements.push(
      db.insert(odometerLogs).values({
        vehicleId: id,
        date: input.date,
        odometer: input.odometer,
        source: 'record',
        serviceRecordId: recordId,
      }),
    )
  }
  if (toClose.length > 0) {
    statements.push(
      db
        .update(dueItems)
        .set({
          closedByServiceItemId: sql`(SELECT min(${serviceItems.id}) FROM ${serviceItems} WHERE ${serviceItems.serviceRecordId} = ${recordId} AND ${serviceItems.serviceId} = ${dueItems.serviceId})`,
        })
        .where(and(inArray(dueItems.id, toClose), isNull(dueItems.closedByServiceItemId))),
    )
  }
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return c.json<ServiceRecordsResponse>(await serviceRecordsView(db, vehicle, today), 201)
})

serviceRecordRoutes.delete('/service-records/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Service record not found'), 404)

  const db = drizzle(c.env.DB)
  const [record] = await db
    .select({ vehicleId: serviceRecords.vehicleId })
    .from(serviceRecords)
    .where(eq(serviceRecords.id, id))
  if (!record) return c.json(notFound('Service record not found'), 404)

  // Minder items this record closed, and other records' lines that could take them over.
  const closed = await db
    .select({ id: dueItems.id, serviceId: dueItems.serviceId, loggedAt: minderLogs.loggedAt })
    .from(dueItems)
    .innerJoin(serviceItems, eq(serviceItems.id, dueItems.closedByServiceItemId))
    .innerJoin(minderLogs, eq(minderLogs.id, dueItems.minderLogId))
    .where(eq(serviceItems.serviceRecordId, id))
  const others = closed.length
    ? await db
        .select({ id: serviceItems.id, serviceId: serviceItems.serviceId, date: serviceRecords.date })
        .from(serviceItems)
        .innerJoin(serviceRecords, eq(serviceRecords.id, serviceItems.serviceRecordId))
        .where(
          and(
            eq(serviceRecords.vehicleId, record.vehicleId),
            ne(serviceRecords.id, id),
            isNotNull(serviceItems.serviceId),
          ),
        )
    : []
  const reassigned = reassignClosures(
    closed,
    others.map((o) => ({ ...o, serviceId: o.serviceId! })),
  )

  const itemIds = db
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(eq(serviceItems.serviceRecordId, id))
  // FK-safe order: release this record's Minder closures (handing covered items
  // to another record), then remove children, then the record.
  const statements: BatchItem<'sqlite'>[] = [
    db
      .update(dueItems)
      .set({ closedByServiceItemId: null })
      .where(inArray(dueItems.closedByServiceItemId, itemIds)),
    ...reassigned.map((r) =>
      db
        .update(dueItems)
        .set({ closedByServiceItemId: r.closedByServiceItemId })
        .where(and(eq(dueItems.id, r.dueItemId), isNull(dueItems.closedByServiceItemId))),
    ),
    db.delete(odometerLogs).where(eq(odometerLogs.serviceRecordId, id)),
    db.delete(serviceItems).where(eq(serviceItems.serviceRecordId, id)),
  ]
  const results = await db.batch([
    ...(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]),
    db.delete(serviceRecords).where(eq(serviceRecords.id, id)).returning({ id: serviceRecords.id }),
  ])
  const deleted = results[results.length - 1] as { id: number }[]
  if (deleted.length === 0) return c.json(notFound('Service record not found'), 404)
  return c.body(null, 204)
})
