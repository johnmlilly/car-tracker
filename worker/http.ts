import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { ErrorResponse } from '../shared/api'
import { vehicles } from './db/schema'

export type Db = DrizzleD1Database

export function parseId(raw: string): number | null {
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

export function notFound(message: string) {
  return { error: { message } } satisfies ErrorResponse
}

export async function findVehicle(db: Db, id: number) {
  const [row] = await db
    .select({ id: vehicles.id, name: vehicles.name })
    .from(vehicles)
    .where(eq(vehicles.id, id))
  return row
}
