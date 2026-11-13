import { and, asc, desc, eq, isNull } from 'drizzle-orm'
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
import { dueItems, minderLogs, receipts, services, vehicles } from '../db/schema'
import { createClient, extractReceipt } from '../extract'
import { type Db, findVehicle, notFound, parseId } from '../http'
import { normalizeCode } from '../minder'
import { FILE_MESSAGES, parseReceiptUpload, VEHICLE_MESSAGE } from '../receipt'
import { ExtractError, matchService, parseExtraction } from '../receiptExtraction'
import { parseServiceRecordInput } from '../serviceRecord'
import { prepareServiceRecordInsert } from '../serviceRecordWrite'

export const receiptRoutes = new Hono<{ Bindings: Env }>()

/** Leaves room for multipart boundaries and the vehicleId field. */
const MAX_BODY_BYTES = MAX_RECEIPT_BYTES + 64 * 1024

const EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' } as const

const RECEIPT_NOT_FOUND = 'Receipt not found'
const ALREADY_READ = 'This receipt has already been read.'
const READ_FAILED = "Couldn't read this receipt. Try again."
const NOT_CONFIRMABLE = "This receipt isn't ready to confirm."
const CODE_MESSAGE = 'Enter a code like A or B12.'

/** Code of the newest Minder log for the vehicle that still has an open due item. */
async function openMinderCode(db: Db, vehicleId: number): Promise<string | null> {
  const [row] = await db
    .select({ code: minderLogs.code })
    .from(minderLogs)
    .innerJoin(dueItems, eq(dueItems.minderLogId, minderLogs.id))
    .where(and(eq(minderLogs.vehicleId, vehicleId), isNull(dueItems.closedByServiceItemId)))
    .orderBy(desc(minderLogs.loggedAt), desc(minderLogs.id))
    .limit(1)
  return row?.code ?? null
}

/** True when `err`, or an error it wraps, is a SQLite unique-constraint failure. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if (e.message.includes('UNIQUE constraint failed')) return true
  }
  return false
}

async function vehicleModel(db: Db, vehicleId: number) {
  const [row] = await db
    .select({ scheduleModel: vehicles.scheduleModel })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
  return row?.scheduleModel ?? null
}

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

  const serviceList = await db
    .select({ id: services.id, name: services.name, keywords: services.keywords })
    .from(services)
    .orderBy(asc(services.name))
  const scheduleModel = row.vehicleId === null ? null : await vehicleModel(db, row.vehicleId)

  let extraction: ReceiptDetail['extraction'] = null
  if (stored !== null) {
    // Written only by the read route, after parseExtraction validated it.
    const parsed = JSON.parse(stored) as ReceiptExtraction
    extraction = {
      ...parsed,
      lineItems: parsed.lineItems.map((line) => ({
        ...line,
        suggestedServiceId: matchService(line.description, serviceList),
      })),
    }
  }
  return c.json<ReceiptDetail>({
    ...toView(row),
    today: todayInEastern(new Date()),
    scheduleModel,
    services: serviceList.map(({ id: serviceId, name }) => ({ id: serviceId, name })),
    openMinderCode:
      scheduleModel === 'minder' && row.vehicleId !== null
        ? await openMinderCode(db, row.vehicleId)
        : null,
    extraction,
  })
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

receiptRoutes.post('/receipts/:id/confirm', async (c) => {
  const id = parseId(c.req.param('id'))
  if (id === null) return c.json(notFound(RECEIPT_NOT_FOUND), 404)

  const db = drizzle(c.env.DB)
  const [receipt] = await db
    .select({ vehicleId: receipts.vehicleId, status: receipts.status })
    .from(receipts)
    .where(eq(receipts.id, id))
  if (!receipt) return c.json(notFound(RECEIPT_NOT_FOUND), 404)
  const notConfirmable = () =>
    c.json<ErrorResponse>({ error: { message: NOT_CONFIRMABLE } }, 409)
  if (receipt.status !== 'review' || receipt.vehicleId === null) return notConfirmable()
  const vehicleId = receipt.vehicleId

  const body: unknown = await c.req.json().catch(() => undefined)
  const parsed = parseServiceRecordInput(body, todayInEastern(new Date()))
  const fields = parsed.ok ? {} : { ...parsed.fields }
  const rawCode =
    typeof body === 'object' && body !== null ? (body as { minderCode?: unknown }).minderCode : null
  let minderCode: string | null = null
  if (rawCode !== null && rawCode !== undefined) {
    minderCode = typeof rawCode === 'string' ? normalizeCode(rawCode) : null
    if (minderCode === null) fields.minderCode = CODE_MESSAGE
  }
  const invalid = (f: Record<string, string>) =>
    c.json<ErrorResponse>({ error: { message: 'Invalid service record', fields: f } }, 400)
  if (!parsed.ok || Object.keys(fields).length > 0) return invalid(fields)

  // Only Minder vehicles keep a Minder code.
  if ((await vehicleModel(db, vehicleId)) !== 'minder') minderCode = null

  const prepared = await prepareServiceRecordInsert(db, vehicleId, parsed.value, {
    source: 'receipt',
    receiptId: id,
    minderCode,
  })
  if (!prepared.ok) return invalid(prepared.fields)

  try {
    await db.batch([
      ...prepared.statements,
      db
        .update(receipts)
        .set({ status: 'confirmed' })
        .where(and(eq(receipts.id, id), eq(receipts.status, 'review'))),
    ])
  } catch (err) {
    // The unique receipt_id index stops a second record for the same receipt;
    // the batch rolls back as one transaction.
    if (isUniqueViolation(err)) {
      return notConfirmable()
    }
    throw err
  }

  const [view] = await selectReceipts(db).where(eq(receipts.id, id))
  return c.json<ReceiptView>(toView(view), 201)
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

  // Uploaded bytes are untrusted: never let the browser sniff them into HTML,
  // and sandbox images so nothing runs from them on the app's origin. PDFs skip
  // the sandbox (owner decision 2026-11-11) because browsers refuse to render a
  // sandboxed PDF in the review page's iframe; their bytes were checked to start
  // with %PDF- at upload and nosniff keeps them rendered as PDF.
  return c.body(object.body, 200, {
    'Content-Type': row.contentType,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    ...(row.contentType === 'application/pdf' ? {} : { 'Content-Security-Policy': 'sandbox' }),
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
