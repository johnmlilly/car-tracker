import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  scheduleModel: text('schedule_model', { enum: ['interval', 'minder'] }).notNull(),
})

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(),
})

export const scheduleItems = sqliteTable(
  'schedule_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id),
    intervalMiles: integer('interval_miles'),
    intervalMonths: integer('interval_months'),
    baselineDate: text('baseline_date'),
    baselineOdometer: integer('baseline_odometer'),
  },
  (t) => [
    unique().on(t.vehicleId, t.serviceId),
    check(
      'schedule_items_interval_set',
      sql`${t.intervalMiles} IS NOT NULL OR ${t.intervalMonths} IS NOT NULL`,
    ),
  ],
)

export const minderCodes = sqliteTable(
  'minder_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    kind: text('kind', { enum: ['main', 'sub'] }).notNull(),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id),
  },
  (t) => [unique().on(t.code, t.serviceId)],
)

export const odometerLogs = sqliteTable(
  'odometer_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    date: text('date').notNull(),
    odometer: integer('odometer').notNull(),
    source: text('source', { enum: ['manual', 'record'] })
      .notNull()
      .default('manual'),
  },
  (t) => [index('odometer_logs_vehicle_id_date_idx').on(t.vehicleId, t.date)],
)

export const minderLogs = sqliteTable(
  'minder_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    code: text('code').notNull(),
    loggedAt: text('logged_at').notNull(),
    odometer: integer('odometer'),
  },
  (t) => [index('minder_logs_vehicle_id_logged_at_idx').on(t.vehicleId, t.loggedAt)],
)

export const dueItems = sqliteTable(
  'due_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    minderLogId: integer('minder_log_id')
      .notNull()
      .references(() => minderLogs.id),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id),
  },
  (t) => [unique().on(t.minderLogId, t.serviceId)],
)
