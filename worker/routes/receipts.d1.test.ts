import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReceiptDetail, ReceiptView, ReceiptsResponse } from '../../shared/api'
import { extractReceipt } from '../extract'
import app from '../index'
import { ExtractError } from '../receiptExtraction'
import { FILE_MESSAGES, VEHICLE_MESSAGE } from '../receipt'
import { startPlatform } from '../test/platform'

vi.mock('../extract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../extract')>()),
  extractReceipt: vi.fn(),
}))
const extract = vi.mocked(extractReceipt)

let env: Env
let dispose: () => Promise<void>

beforeEach(async () => {
  ;({ env, dispose } = await startPlatform())
  env = { ...env, ANTHROPIC_API_KEY: 'test-key' }
  extract.mockReset()
})

afterEach(async () => {
  await dispose()
})

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const PDF = new TextEncoder().encode('%PDF-1.7\nfake')
const WEBP = new TextEncoder().encode('RIFF\x24\0\0\0WEBPVP8 fake')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF = new TextEncoder().encode('GIF89a')

async function vehicleId(name: string): Promise<number> {
  const row = await env.DB.prepare('SELECT id FROM vehicles WHERE name = ?')
    .bind(name)
    .first<{ id: number }>()
  return row!.id
}

function upload(fields: { vehicleId?: string; file?: Uint8Array; type?: string }) {
  const form = new FormData()
  if (fields.vehicleId !== undefined) form.set('vehicleId', fields.vehicleId)
  if (fields.file) {
    form.set('file', new File([fields.file], 'receipt', { type: fields.type ?? 'image/webp' }))
  }
  return app.request('/api/receipts', { method: 'POST', body: form }, env)
}

async function rows() {
  const { results } = await env.DB.prepare(
    'SELECT id, r2_key AS r2Key, content_type AS contentType, status FROM receipts ORDER BY id',
  ).all<{ id: number; r2Key: string; contentType: string; status: string }>()
  return results
}

async function fieldsOf(res: Response) {
  return ((await res.json()) as { error: { fields: Record<string, string> } }).error.fields
}

describe('receipt routes against D1 and R2', () => {
  it('stores a WebP and a PDF as pending receipts', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')

    const webpRes = await upload({ vehicleId: String(corolla), file: WEBP, type: 'image/png' })
    expect(webpRes.status).toBe(201)
    const webp = (await webpRes.json()) as ReceiptView
    expect(webp).toMatchObject({
      vehicle: { id: corolla, name: '2019 Toyota Corolla' },
      contentType: 'image/webp',
      status: 'pending',
    })

    const pdfRes = await upload({ vehicleId: String(corolla), file: PDF, type: 'text/plain' })
    expect(pdfRes.status).toBe(201)

    const stored = await rows()
    expect(stored.map((r) => [r.contentType, r.status])).toEqual([
      ['image/webp', 'pending'],
      ['application/pdf', 'pending'],
    ])
    expect(stored[0].r2Key).toMatch(/^receipts\/[0-9a-f-]{36}\.webp$/)
    expect(stored[1].r2Key).toMatch(/\.pdf$/)

    const image = await env.RECEIPTS.get(stored[0].r2Key)
    expect(image?.httpMetadata?.contentType).toBe('image/webp')
    expect(new Uint8Array(await image!.arrayBuffer())).toEqual(WEBP)

    const object = await env.RECEIPTS.get(stored[1].r2Key)
    expect(object?.httpMetadata?.contentType).toBe('application/pdf')
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(PDF)
  })

  it('stores a JPEG upload as image/jpeg', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const res = await upload({ vehicleId: String(corolla), file: JPEG, type: 'image/webp' })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ contentType: 'image/jpeg' })
    const [row] = await rows()
    expect(row.r2Key).toMatch(/\.jpg$/)
  })

  it('stores a PNG upload as image/png', async () => {
    const corolla = await vehicleId('2019 Toyota Corolla')
    const res = await upload({ vehicleId: String(corolla), file: PNG, type: 'image/webp' })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ contentType: 'image/png' })
    const [row] = await rows()
    expect(row.r2Key).toMatch(/\.png$/)
  })

  it('rejects bytes that are not WebP, JPEG, PNG, or PDF and stores nothing', async () => {
    const res = await upload({ vehicleId: '1', file: GIF, type: 'image/webp' })
    expect(res.status).toBe(400)
    expect(await fieldsOf(res)).toEqual({ file: FILE_MESSAGES.type })
    expect(await rows()).toEqual([])
    expect((await env.RECEIPTS.list()).objects).toEqual([])
  })

  it.each([undefined, 'x', '999'])('rejects vehicleId %s and stores nothing', async (id) => {
    const res = await upload({ vehicleId: id, file: WEBP })
    expect(res.status).toBe(400)
    expect(await fieldsOf(res)).toEqual({ vehicleId: VEHICLE_MESSAGE })
    expect((await env.RECEIPTS.list()).objects).toEqual([])
  })

  it('rejects a non-multipart body', async () => {
    const res = await app.request(
      '/api/receipts',
      { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects an oversized body by Content-Length before reading it', async () => {
    const res = await app.request(
      '/api/receipts',
      { method: 'POST', body: 'x', headers: { 'Content-Length': String(11 * 1024 * 1024) } },
      env,
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: { message: FILE_MESSAGES.size } })
  })

  it('lists receipts newest first with vehicle names', async () => {
    const odyssey = await vehicleId('2024 Honda Odyssey')
    const corolla = await vehicleId('2019 Toyota Corolla')
    await upload({ vehicleId: String(odyssey), file: WEBP })
    await upload({ vehicleId: String(corolla), file: PDF })
    await env.DB.prepare(
      "INSERT INTO receipts (r2_key, content_type, uploaded_at) VALUES ('receipts/old.webp', 'image/webp', '2020-01-01T00:00:00.000Z')",
    ).run()

    const res = await app.request('/api/receipts', {}, env)
    expect(res.status).toBe(200)
    const { receipts } = (await res.json()) as ReceiptsResponse
    expect(receipts.map((r) => r.vehicle?.name ?? null)).toEqual([
      '2019 Toyota Corolla',
      '2024 Honda Odyssey',
      null,
    ])
  })

  it('serves a stored PDF unsandboxed so it can preview inline', async () => {
    const created = (await (await upload({ vehicleId: '1', file: PDF })).json()) as ReceiptView

    const res = await app.request(`/api/receipts/${created.id}/file`, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
    expect(res.headers.get('Content-Disposition')).toBe('inline')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
  })

  it('serves a stored image sandboxed', async () => {
    const created = (await (await upload({ vehicleId: '1', file: WEBP })).json()) as ReceiptView

    const res = await app.request(`/api/receipts/${created.id}/file`, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Security-Policy')).toBe('sandbox')
  })

  it('returns 404 for a file whose row or object is missing', async () => {
    const created = (await (await upload({ vehicleId: '1', file: WEBP })).json()) as ReceiptView
    const [{ r2Key }] = await rows()
    await env.RECEIPTS.delete(r2Key)

    for (const path of [`/api/receipts/${created.id}/file`, '/api/receipts/999/file', '/api/receipts/x/file']) {
      const res = await app.request(path, {}, env)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: { message: 'Receipt not found' } })
    }
  })

  it('deletes a pending receipt and its object', async () => {
    const created = (await (await upload({ vehicleId: '1', file: WEBP })).json()) as ReceiptView

    const res = await app.request(`/api/receipts/${created.id}`, { method: 'DELETE' }, env)
    expect(res.status).toBe(204)
    expect(await rows()).toEqual([])
    expect((await env.RECEIPTS.list()).objects).toEqual([])

    const again = await app.request(`/api/receipts/${created.id}`, { method: 'DELETE' }, env)
    expect(again.status).toBe(404)
  })

  it('refuses to delete a receipt that is past pending', async () => {
    const created = (await (await upload({ vehicleId: '1', file: WEBP })).json()) as ReceiptView
    await env.DB.prepare("UPDATE receipts SET status = 'review'").run()

    const res = await app.request(`/api/receipts/${created.id}`, { method: 'DELETE' }, env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: { message: 'Only receipts waiting for reading can be deleted.' },
    })
    expect(await rows()).toHaveLength(1)
    expect((await env.RECEIPTS.list()).objects).toHaveLength(1)
  })

  it('returns 404 when deleting an invalid id', async () => {
    const res = await app.request('/api/receipts/0', { method: 'DELETE' }, env)
    expect(res.status).toBe(404)
  })

  describe('reading', () => {
    const READ = {
      date: '2026-11-10',
      shop: 'Honda of Anytown',
      odometer: 41_250,
      totalCents: 12_999,
      minderCode: 'B12',
      lineItems: [
        { description: 'Synthetic oil change', amountCents: 7999 },
        { description: 'Cabin air filter', amountCents: 5000 },
      ],
    }

    async function uploaded() {
      return ((await (await upload({ vehicleId: '1', file: WEBP })).json()) as ReceiptView).id
    }
    const read = (id: number | string, readEnv: Env = env) =>
      app.request(`/api/receipts/${id}/read`, { method: 'POST' }, readEnv)
    const detail = async (id: number) =>
      (await (await app.request(`/api/receipts/${id}`, {}, env)).json()) as ReceiptDetail

    it('reads a pending receipt, stores the validated extraction, and moves it to review', async () => {
      const id = await uploaded()
      extract.mockResolvedValue({ ...READ, minderCode: 'b 21', shop: '  Honda of Anytown ' })

      const res = await read(id)
      expect(res.status).toBe(200)
      expect(((await res.json()) as ReceiptView).status).toBe('review')

      const [call] = extract.mock.calls
      expect(call[0].contentType).toBe('image/webp')
      expect(new Uint8Array(call[0].bytes)).toEqual(WEBP)

      const row = await env.DB.prepare('SELECT status, extraction FROM receipts WHERE id = ?')
        .bind(id)
        .first<{ status: string; extraction: string }>()
      expect(row?.status).toBe('review')
      expect(JSON.parse(row!.extraction)).toEqual(READ)
    })

    it('returns the extraction with suggested services in the detail', async () => {
      const id = await uploaded()
      expect((await detail(id)).extraction).toBeNull()

      extract.mockResolvedValue(READ)
      await read(id)
      const oil = await env.DB.prepare("SELECT id FROM services WHERE name = 'Oil and filter change'")
        .first<{ id: number }>()
      const result = await detail(id)
      expect(result).toMatchObject({ id, status: 'review', vehicle: { id: 1 } })
      expect(result.extraction?.lineItems).toEqual([
        { description: 'Synthetic oil change', amountCents: 7999, suggestedServiceId: oil!.id },
        { description: 'Cabin air filter', amountCents: 5000, suggestedServiceId: null },
      ])
      expect(result.extraction?.minderCode).toBe('B12')
    })

    it('refuses to read a receipt twice', async () => {
      const id = await uploaded()
      extract.mockResolvedValue(READ)
      await read(id)
      const res = await read(id)
      expect(res.status).toBe(409)
      expect(extract).toHaveBeenCalledTimes(1)
    })

    it('keeps the first result when a concurrent read finishes first', async () => {
      const id = await uploaded()
      const winner = JSON.stringify({ ...READ, shop: 'First read' })
      extract.mockImplementation(async () => {
        // Another read lands while this one waits on Claude.
        await env.DB.prepare("UPDATE receipts SET status = 'review', extraction = ? WHERE id = ?")
          .bind(winner, id)
          .run()
        return READ
      })

      const res = await read(id)
      expect(res.status).toBe(409)
      const row = await env.DB.prepare('SELECT status, extraction FROM receipts WHERE id = ?')
        .bind(id)
        .first<{ status: string; extraction: string }>()
      expect(row).toEqual({ status: 'review', extraction: winner })
    })

    it('leaves the receipt pending when reading fails', async () => {
      const id = await uploaded()
      extract.mockRejectedValue(new ExtractError('Claude stopped: refusal'))
      const res = await read(id)
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: { message: "Couldn't read this receipt. Try again." } })
      const row = await env.DB.prepare('SELECT status, extraction FROM receipts WHERE id = ?')
        .bind(id)
        .first<{ status: string; extraction: string | null }>()
      expect(row).toEqual({ status: 'pending', extraction: null })
    })

    it('fails with 500 and stays pending when the API key is missing', async () => {
      const id = await uploaded()
      const res = await read(id, { ...env, ANTHROPIC_API_KEY: '' })
      expect(res.status).toBe(500)
      expect(extract).not.toHaveBeenCalled()
      expect((await detail(id)).status).toBe('pending')
    })

    it('returns 404 for a missing receipt or file', async () => {
      expect((await read(999)).status).toBe(404)
      expect((await read('abc')).status).toBe(404)
      expect((await app.request('/api/receipts/999', {}, env)).status).toBe(404)

      const id = await uploaded()
      const { r2Key } = (await env.DB.prepare('SELECT r2_key AS r2Key FROM receipts WHERE id = ?')
        .bind(id)
        .first<{ r2Key: string }>())!
      await env.RECEIPTS.delete(r2Key)
      expect((await read(id)).status).toBe(404)
      expect(extract).not.toHaveBeenCalled()
    })
  })
})
