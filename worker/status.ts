import { and, asc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm'
import type { DueItemView, MileageSummary, ScheduleItemView, Vehicle } from '../shared/api'
import { estimateMileage } from '../shared/mileage'
import { computeDue, computeStatus, resolveLastDone } from '../shared/schedule'
import { pickNextDue } from '../shared/scheduleView'
import {
  dueItems,
  minderLogs,
  odometerLogs,
  scheduleItems,
  serviceItems,
  serviceRecords,
  services,
  vehicles,
} from './db/schema'
import type { Db } from './http'
import { groupDueItems, mergeMinderStatus } from './minder'

const itemColumns = {
  id: scheduleItems.id,
  vehicleId: scheduleItems.vehicleId,
  serviceId: scheduleItems.serviceId,
  serviceName: services.name,
  intervalMiles: scheduleItems.intervalMiles,
  intervalMonths: scheduleItems.intervalMonths,
  baselineDate: scheduleItems.baselineDate,
  baselineOdometer: scheduleItems.baselineOdometer,
}

type ItemRow = {
  id: number
  vehicleId: number
  serviceId: number
  serviceName: string
  intervalMiles: number | null
  intervalMonths: number | null
  baselineDate: string | null
  baselineOdometer: number | null
}

type RecordPoint = { date: string; odometer: number | null }

function toItemView(
  row: ItemRow,
  records: RecordPoint[],
  today: string,
  currentMiles: number | null,
): ScheduleItemView {
  const lastDone = resolveLastDone(row, records)
  const due = computeDue({ ...row, ...lastDone })
  return {
    id: row.id,
    serviceName: row.serviceName,
    intervalMiles: row.intervalMiles,
    intervalMonths: row.intervalMonths,
    baselineDate: row.baselineDate,
    baselineOdometer: row.baselineOdometer,
    ...lastDone,
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

/** Latest record date and highest record odometer per vehicle and matched service. */
async function recordsByVehicleService(db: Db, vehicleIds: number[]) {
  const rows = vehicleIds.length
    ? await db
        .select({
          vehicleId: serviceRecords.vehicleId,
          serviceId: serviceItems.serviceId,
          date: max(serviceRecords.date),
          odometer: max(serviceRecords.odometer),
        })
        .from(serviceItems)
        .innerJoin(serviceRecords, eq(serviceRecords.id, serviceItems.serviceRecordId))
        .where(and(inArray(serviceRecords.vehicleId, vehicleIds), isNotNull(serviceItems.serviceId)))
        .groupBy(serviceRecords.vehicleId, serviceItems.serviceId)
    : []
  const map = new Map<string, RecordPoint[]>()
  for (const row of rows) {
    if (row.date === null) continue
    map.set(`${row.vehicleId}:${row.serviceId}`, [{ date: row.date, odometer: row.odometer }])
  }
  return map
}

export async function mileageByVehicle(db: Db, vehicleIds: number[], today: string) {
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

/** Due items with their log and service, open or closed; filter with `isOpen`. */
export function selectDueItems(db: Db) {
  return db
    .select({
      id: dueItems.id,
      vehicleId: minderLogs.vehicleId,
      serviceId: dueItems.serviceId,
      serviceName: services.name,
      logId: minderLogs.id,
      code: minderLogs.code,
      loggedAt: minderLogs.loggedAt,
    })
    .from(dueItems)
    .innerJoin(minderLogs, eq(minderLogs.id, dueItems.minderLogId))
    .innerJoin(services, eq(services.id, dueItems.serviceId))
}

export const isOpen = isNull(dueItems.closedByServiceItemId)

async function dueItemsByVehicle(db: Db, vehicleIds: number[]) {
  const rows = vehicleIds.length
    ? await selectDueItems(db).where(and(inArray(minderLogs.vehicleId, vehicleIds), isOpen))
    : []
  return new Map<number, DueItemView[]>(
    vehicleIds.map((id) => [id, groupDueItems(rows.filter((r) => r.vehicleId === id))]),
  )
}

export const vehicleColumns = {
  id: vehicles.id,
  name: vehicles.name,
  scheduleModel: vehicles.scheduleModel,
}

export type VehicleRow = { id: number; name: string; scheduleModel: Vehicle['scheduleModel'] }

/** Schedule items, leftover Minder items, and attention counts per vehicle. */
export async function statusByVehicle(db: Db, rows: VehicleRow[], today: string) {
  const ids = rows.map((v) => v.id)
  const items = ids.length
    ? await selectItems(db)
        .where(inArray(scheduleItems.vehicleId, ids))
        .orderBy(asc(services.name))
    : []
  const mileage = await mileageByVehicle(db, ids, today)
  const records = await recordsByVehicleService(db, ids)
  const due = await dueItemsByVehicle(
    db,
    rows.filter((v) => v.scheduleModel === 'minder').map((v) => v.id),
  )
  return new Map(
    rows.map((v) => {
      const vehicleMileage = mileage.get(v.id) ?? null
      const views = items
        .filter((i) => i.vehicleId === v.id)
        .map((i) =>
          toItemView(
            i,
            records.get(`${i.vehicleId}:${i.serviceId}`) ?? [],
            today,
            vehicleMileage?.estimate ?? null,
          ),
        )
      const merged = mergeMinderStatus(views, due.get(v.id) ?? [])
      const vehicle: Vehicle = {
        ...v,
        mileage: vehicleMileage,
        attention: {
          soon: merged.items.filter((i) => i.status === 'soon').length,
          overdue:
            merged.items.filter((i) => i.status === 'overdue').length + merged.dueItems.length,
        },
        nextDue: pickNextDue(merged.items, merged.dueItems, vehicleMileage?.estimate ?? null, today),
      }
      return [v.id, { vehicle, ...merged }]
    }),
  )
}
