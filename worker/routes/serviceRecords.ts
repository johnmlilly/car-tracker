import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import type { ErrorResponse, ServiceRecordView, ServiceRecordsResponse } from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import {
  dueItems,
  minderLogs,
  odometerLogs,
  receipts,
  serviceItems,
  serviceRecords,
  services,
} from '../db/schema'
import { type Db, findVehicle, notFound, parseId } from '../http'
import { parseServiceRecordInput, reassignClosures } from '../serviceRecord'
import { prepareServiceRecordInsert } from '../serviceRecordWrite'

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
      receiptId: receipts.id,
      receiptContentType: receipts.contentType,
    })
    .from(serviceRecords)
    .leftJoin(receipts, eq(receipts.id, serviceRecords.receiptId))
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
      ({ receiptId, receiptContentType, ...record }): ServiceRecordView => ({
        ...record,
        receipt:
          receiptId !== null && receiptContentType !== null
            ? { id: receiptId, contentType: receiptContentType }
            : null,
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

  const prepared = await prepareServiceRecordInsert(db, id, input, { source: 'manual' })
  if (!prepared.ok) return invalid(prepared.fields)
  await db.batch(prepared.statements)

  return c.json<ServiceRecordsResponse>(await serviceRecordsView(db, vehicle, today), 201)
})

serviceRecordRoutes.delete('/service-records/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound('Service record not found'), 404)

  const db = drizzle(c.env.DB)
  const [record] = await db
    .select({ vehicleId: serviceRecords.vehicleId, receiptId: serviceRecords.receiptId })
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
  // A record confirmed from a receipt sends that receipt back to review.
  if (record.receiptId !== null) {
    statements.push(
      db.update(receipts).set({ status: 'review' }).where(eq(receipts.id, record.receiptId)),
    )
  }
  const results = await db.batch([
    ...(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]),
    db.delete(serviceRecords).where(eq(serviceRecords.id, id)).returning({ id: serviceRecords.id }),
  ])
  const deleted = results[results.length - 1] as { id: number }[]
  if (deleted.length === 0) return c.json(notFound('Service record not found'), 404)
  return c.body(null, 204)
})
