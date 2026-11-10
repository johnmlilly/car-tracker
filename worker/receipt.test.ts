import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_BYTES } from '../shared/api'
import { FILE_MESSAGES, parseReceiptUpload, sniffReceiptType, VEHICLE_MESSAGE } from './receipt'

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]
const PDF = [...'%PDF-1.7\n'].map((c) => c.charCodeAt(0))
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const HEIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]

const fileOf = (bytes: number[], type = 'image/jpeg', name = 'receipt.jpg') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('sniffReceiptType', () => {
  it('recognizes JPEG and PDF', () => {
    expect(sniffReceiptType(new Uint8Array(JPEG))).toBe('image/jpeg')
    expect(sniffReceiptType(new Uint8Array(PDF))).toBe('application/pdf')
  })

  it.each([
    ['PNG', PNG],
    ['HEIC', HEIC],
    ['text', [...'hello'].map((c) => c.charCodeAt(0))],
    ['truncated JPEG', [0xff, 0xd8]],
    ['empty', []],
  ])('rejects %s', (_, bytes) => {
    expect(sniffReceiptType(new Uint8Array(bytes))).toBeNull()
  })
})

describe('parseReceiptUpload', () => {
  it('accepts a JPEG and a PDF, using the sniffed type', async () => {
    const jpeg = await parseReceiptUpload({ vehicleId: '2', file: fileOf(JPEG, 'image/png') })
    expect(jpeg).toMatchObject({ ok: true, value: { vehicleId: 2, contentType: 'image/jpeg' } })

    const pdf = await parseReceiptUpload({
      vehicleId: '1',
      file: fileOf(PDF, 'application/octet-stream', 'x.bin'),
    })
    expect(pdf).toMatchObject({ ok: true, value: { vehicleId: 1, contentType: 'application/pdf' } })
  })

  it('rejects bytes that are not JPEG or PDF, whatever the declared type', async () => {
    const result = await parseReceiptUpload({ vehicleId: '1', file: fileOf(PNG, 'image/jpeg') })
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
    const big = new File([new Uint8Array(MAX_RECEIPT_BYTES + 1).fill(0xff)], 'big.jpg')
    expect(await parseReceiptUpload({ vehicleId: '1', file: big })).toEqual({
      ok: false,
      fields: { file: FILE_MESSAGES.size },
    })
  })

  it('accepts a file exactly at the size limit', async () => {
    const bytes = new Uint8Array(MAX_RECEIPT_BYTES)
    bytes.set(JPEG)
    const result = await parseReceiptUpload({ vehicleId: '1', file: new File([bytes], 'max.jpg') })
    expect(result.ok).toBe(true)
  })

  it.each([undefined, '', '0', 'abc', '01', '1.5'])(
    'rejects vehicleId %s',
    async (vehicleId) => {
      const result = await parseReceiptUpload({ vehicleId, file: fileOf(JPEG) })
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
