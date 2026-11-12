import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { ServiceRecordInput } from '../shared/api'
import { dueItems, minderLogs, odometerLogs, serviceItems, serviceRecords, services } from './db/schema'
import type { Db } from './http'
import { findConflict } from './odometer'
import { selectDueItemsToClose } from './serviceRecord'
import { isOpen, selectDueItems } from './status'

export interface ServiceRecordSource {
  source: 'manual' | 'receipt'
  receiptId?: number | null
  minderCode?: string | null
}

export type ServiceRecordInsert =
  | { ok: true; statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] }
  | { ok: false; fields: Record<string, string> }

/**
 * Checks a parsed record against the database (known services, odometer
 * history) and builds the batch that writes it: the record, its lines, its
 * odometer reading, and the Minder items it closes. Run the statements in one
 * batch, which D1 executes as one transaction.
 */
export async function prepareServiceRecordInsert(
  db: Db,
  vehicleId: number,
  input: ServiceRecordInput,
  origin: ServiceRecordSource,
): Promise<ServiceRecordInsert> {
  const known = new Set((await db.select({ id: services.id }).from(services)).map((s) => s.id))
  const fields: Record<string, string> = {}
  input.items.forEach((item, index) => {
    if (item.serviceId !== null && !known.has(item.serviceId)) {
      fields[`items.${index}.serviceId`] = 'Pick a service from the list.'
    }
  })

  if (input.odometer !== null) {
    const existing = await db
      .select({ date: odometerLogs.date, odometer: odometerLogs.odometer })
      .from(odometerLogs)
      .where(eq(odometerLogs.vehicleId, vehicleId))
    const conflict = findConflict(existing, { date: input.date, odometer: input.odometer })
    if (conflict) fields.odometer = conflict
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields }

  const openRows = await selectDueItems(db).where(and(eq(minderLogs.vehicleId, vehicleId), isOpen))
  const toClose = selectDueItemsToClose(
    openRows,
    input.items.map((i) => i.serviceId),
    input.date,
  )

  // One batch is one transaction, so max(id) is the record inserted first.
  const recordId = sql<number>`(SELECT max(${serviceRecords.id}) FROM ${serviceRecords})`
  const statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(serviceRecords).values({
      vehicleId,
      date: input.date,
      odometer: input.odometer,
      shop: input.shop,
      totalCents: input.totalCents,
      source: origin.source,
      receiptId: origin.receiptId ?? null,
      minderCode: origin.minderCode ?? null,
    }),
    db.insert(serviceItems).values(
      input.items.map((item) => ({ ...item, serviceRecordId: recordId })),
    ),
  ]
  if (input.odometer !== null) {
    statements.push(
      db.insert(odometerLogs).values({
        vehicleId,
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
  return { ok: true, statements }
}
