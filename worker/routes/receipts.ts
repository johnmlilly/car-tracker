import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import {
  MAX_RECEIPT_BYTES,
  type ErrorResponse,
  type ReceiptDetail,
  type ReceiptExtraction,
  type ReceiptView,
  type ReceiptsResponse,
} from '../../shared/api'
import { todayInEastern } from '../../shared/schedule'
import { receipts, services, vehicles } from '../db/schema'
import { createClient, extractReceipt } from '../extract'
import { type Db, findVehicle, notFound, parseId } from '../http'
import { FILE_MESSAGES, parseReceiptUpload, VEHICLE_MESSAGE } from '../receipt'
import { ExtractError, matchService, parseExtraction } from '../receiptExtraction'

export const receiptRoutes = new Hono<{ Bindings: Env }>()

/** Leaves room for multipart boundaries and the vehicleId field. */
const MAX_BODY_BYTES = MAX_RECEIPT_BYTES + 64 * 1024

const EXTENSIONS = { 'image/webp': 'webp', 'application/pdf': 'pdf' } as const

const RECEIPT_NOT_FOUND = 'Receipt not found'
const ALREADY_READ = 'This receipt has already been read.'
const READ_FAILED = "Couldn't read this receipt. Try again."

function selectReceipts(db: Db) {
  return db
    .select({
      id: receipts.id,
      vehicleId: receipts.vehicleId,
      vehicleName: vehicles.name,
      contentType: receipts.contentType,
      status: receipts.status,
      uploadedAt: receipts.uploadedAt,
      r2Key: receipts.r2Key,
    })
    .from(receipts)
    .leftJoin(vehicles, eq(vehicles.id, receipts.vehicleId))
}

type ReceiptRow = Awaited<ReturnType<typeof selectReceipts>>[number]

function toView(row: ReceiptRow): ReceiptView {
  return {
    id: row.id,
    vehicle:
      row.vehicleId !== null && row.vehicleName !== null
        ? { id: row.vehicleId, name: row.vehicleName }
        : null,
    contentType: row.contentType,
    status: row.status,
    uploadedAt: row.uploadedAt,
  }
}

receiptRoutes.get('/receipts', async (c) => {
  const db = drizzle(c.env.DB)
  const rows = await selectReceipts(db).orderBy(desc(receipts.uploadedAt), desc(receipts.id))
  return c.json<ReceiptsResponse>({ receipts: rows.map(toView) })
})

receiptRoutes.post('/receipts', async (c) => {
  const tooLarge = () =>
    c.json<ErrorResponse>({ error: { message: FILE_MESSAGES.size } }, 413)
  if (Number(c.req.header('Content-Length')) > MAX_BODY_BYTES) return tooLarge()

  const invalid = (fields: Record<string, string>) =>
    c.json<ErrorResponse>({ error: { message: 'Invalid receipt', fields } }, 400)
  const body = await c.req.parseBody().catch(() => undefined)
  if (!body) return invalid({ file: FILE_MESSAGES.missing })

  const parsed = await parseReceiptUpload(body)
  if (!parsed.ok) return invalid(parsed.fields)
  const { vehicleId, file, contentType } = parsed.value

  const db = drizzle(c.env.DB)
  if (!(await findVehicle(db, vehicleId))) return invalid({ vehicleId: VEHICLE_MESSAGE })

  // R2 and D1 are separate stores: write the object first so a row never
  // points at a missing file, and remove the object if the row fails.
  const r2Key = `receipts/${crypto.randomUUID()}.${EXTENSIONS[contentType]}`
  await c.env.RECEIPTS.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType } })
  let id: number
  try {
    ;[{ id }] = await db
      .insert(receipts)
      .values({ vehicleId, r2Key, contentType, uploadedAt: new Date().toISOString() })
      .returning({ id: receipts.id })
  } catch (err) {
    await c.env.RECEIPTS.delete(r2Key).catch((cleanupErr: unknown) => console.error(cleanupErr))
    throw err
  }

  const [row] = await selectReceipts(db).where(eq(receipts.id, id))
  return c.json<ReceiptView>(toView(row), 201)
})

receiptRoutes.get('/receipts/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const db = drizzle(c.env.DB)
  const [row] = await selectReceipts(db).where(eq(receipts.id, id))
  if (!row) return c.json(notFound(RECEIPT_NOT_FOUND), 404)
  const [{ extraction: stored }] = await db
    .select({ extraction: receipts.extraction })
    .from(receipts)
    .where(eq(receipts.id, id))

  let extraction: ReceiptDetail['extraction'] = null
  if (stored !== null) {
    // Written only by the read route, after parseExtraction validated it.
    const parsed = JSON.parse(stored) as ReceiptExtraction
    const serviceList = await db
      .select({ id: services.id, keywords: services.keywords })
      .from(services)
    extraction = {
      ...parsed,
      lineItems: parsed.lineItems.map((line) => ({
        ...line,
        suggestedServiceId: matchService(line.description, serviceList),
      })),
    }
  }
  return c.json<ReceiptDetail>({ ...toView(row), extraction })
})

receiptRoutes.post('/receipts/:id/read', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const db = drizzle(c.env.DB)
  const [row] = await db
    .select({ r2Key: receipts.r2Key, contentType: receipts.contentType, status: receipts.status })
    .from(receipts)
    .where(eq(receipts.id, id))
  if (!row) return c.json(notFound(RECEIPT_NOT_FOUND), 404)
  const alreadyRead = () => c.json<ErrorResponse>({ error: { message: ALREADY_READ } }, 409)
  if (row.status !== 'pending') return alreadyRead()

  const object = await c.env.RECEIPTS.get(row.r2Key)
  if (!object) return c.json(notFound(RECEIPT_NOT_FOUND), 404)
  if (!c.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')

  let extraction: ReceiptExtraction
  try {
    const raw = await extractReceipt(
      { bytes: await object.arrayBuffer(), contentType: row.contentType },
      createClient(c.env.ANTHROPIC_API_KEY),
    )
    extraction = parseExtraction(raw, todayInEastern(new Date()))
  } catch (err) {
    if (!(err instanceof ExtractError)) throw err
    console.error(`Receipt ${id}: ${err.message}`)
    return c.json<ErrorResponse>({ error: { message: READ_FAILED } }, 502)
  }

  // Only a still-pending receipt moves on; a concurrent read that won keeps its result.
  const updated = await db
    .update(receipts)
    .set({ status: 'review', extraction: JSON.stringify(extraction) })
    .where(and(eq(receipts.id, id), eq(receipts.status, 'pending')))
    .returning({ id: receipts.id })
  if (updated.length === 0) return alreadyRead()

  const [view] = await selectReceipts(db).where(eq(receipts.id, id))
  return c.json<ReceiptView>(toView(view))
})

receiptRoutes.get('/receipts/:id/file', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const db = drizzle(c.env.DB)
  const [row] = await db
    .select({ r2Key: receipts.r2Key, contentType: receipts.contentType })
    .from(receipts)
    .where(eq(receipts.id, id))
  if (!row) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const object = await c.env.RECEIPTS.get(row.r2Key)
  if (!object) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  // Uploaded bytes are untrusted: never let the browser sniff them into HTML
  // or run script from them on the app's origin.
  return c.body(object.body, 200, {
    'Content-Type': row.contentType,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
    'Cache-Control': 'private, max-age=3600',
  })
})

receiptRoutes.delete('/receipts/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const db = drizzle(c.env.DB)
  // Row first, then object: a leftover object is harmless; a row without one is not.
  const [deleted] = await db
    .delete(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.status, 'pending')))
    .returning({ r2Key: receipts.r2Key })
  if (deleted) {
    await c.env.RECEIPTS.delete(deleted.r2Key)
    return c.body(null, 204)
  }

  const [exists] = await db.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id))
  if (!exists) return c.json(notFound(RECEIPT_NOT_FOUND), 404)
  return c.json<ErrorResponse>(
    { error: { message: 'Only receipts waiting for reading can be deleted.' } },
    409,
  )
})
