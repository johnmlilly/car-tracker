import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_BYTES } from '../shared/api'
import { FILE_MESSAGES, parseReceiptUpload, sniffReceiptType, VEHICLE_MESSAGE } from './receipt'

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]
const PDF = [...'%PDF-1.7\n'].map((c) => c.charCodeAt(0))
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const riff = (form: string) => [...`RIFF\x24\0\0\0${form}`].map((c) => c.charCodeAt(0))
const WEBP = riff('WEBPVP8 ')
const WAVE = riff('WAVEfmt ')
const HEIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]

const fileOf = (bytes: number[], type = 'image/webp', name = 'receipt.webp') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('sniffReceiptType', () => {
  it('recognizes WebP and PDF', () => {
    expect(sniffReceiptType(new Uint8Array(WEBP))).toBe('image/webp')
    expect(sniffReceiptType(new Uint8Array(PDF))).toBe('application/pdf')
    expect(sniffReceiptType(new Uint8Array(JPEG))).toBe('image/jpeg')
  })

  it.each([
    ['PNG', PNG],
    ['HEIC', HEIC],
    ['RIFF that is not WebP', WAVE],
    ['truncated WebP', WEBP.slice(0, 11)],
    ['text', [...'hello'].map((c) => c.charCodeAt(0))],
    ['empty', []],
  ])('rejects %s', (_, bytes) => {
    expect(sniffReceiptType(new Uint8Array(bytes))).toBeNull()
  })
})

describe('parseReceiptUpload', () => {
  it('accepts a WebP and a PDF, using the sniffed type', async () => {
    const webp = await parseReceiptUpload({ vehicleId: '2', file: fileOf(WEBP, 'image/jpeg') })
    expect(webp).toMatchObject({ ok: true, value: { vehicleId: 2, contentType: 'image/webp' } })

    const pdf = await parseReceiptUpload({
      vehicleId: '1',
      file: fileOf(PDF, 'application/octet-stream', 'x.bin'),
    })
    expect(pdf).toMatchObject({ ok: true, value: { vehicleId: 1, contentType: 'application/pdf' } })
  })

  it('accepts JPEG bytes', async () => {
    const jpeg = await parseReceiptUpload({ vehicleId: '1', file: fileOf(JPEG, 'image/webp') })
    expect(jpeg).toMatchObject({ ok: true, value: { contentType: 'image/jpeg' } })
  })

  it('rejects bytes that are not WebP, JPEG, or PDF, whatever the declared type', async () => {
    const result = await parseReceiptUpload({ vehicleId: '1', file: fileOf(PNG, 'image/webp') })
    expect(result).toEqual({ ok: false, fields: { file: FILE_MESSAGES.type } })
  })

  it('rejects a missing, non-file, or empty file', async () => {
    for (const file of [undefined, 'text', fileOf([])]) {
      expect(await parseReceiptUpload({ vehicleId: '1', file })).toEqual({
        ok: false,
        fields: { file: FILE_MESSAGES.missing },
      })
    }
  })

  it('rejects a file over the size limit', async () => {
    const big = new File([new Uint8Array(MAX_RECEIPT_BYTES + 1).fill(0xff)], 'big.webp')
    expect(await parseReceiptUpload({ vehicleId: '1', file: big })).toEqual({
      ok: false,
      fields: { file: FILE_MESSAGES.size },
    })
  })

  it('accepts a file exactly at the size limit', async () => {
    const bytes = new Uint8Array(MAX_RECEIPT_BYTES)
    bytes.set(WEBP)
    const result = await parseReceiptUpload({ vehicleId: '1', file: new File([bytes], 'max.webp') })
    expect(result.ok).toBe(true)
  })

  it.each([undefined, '', '0', 'abc', '01', '1.5'])(
    'rejects vehicleId %s',
    async (vehicleId) => {
      const result = await parseReceiptUpload({ vehicleId, file: fileOf(WEBP) })
      expect(result).toEqual({ ok: false, fields: { vehicleId: VEHICLE_MESSAGE } })
    },
  )

  it('reports both fields together', async () => {
    const result = await parseReceiptUpload({})
    expect(result).toEqual({
      ok: false,
      fields: { vehicleId: VEHICLE_MESSAGE, file: FILE_MESSAGES.missing },
    })
  })
})
