import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_RECEIPT_BYTES } from '../shared/api'
import { classifyFile, fitWithin, PREPARE_MESSAGES } from './receiptFile'

describe('fitWithin', () => {
  it.each([
    [4032, 3024, 1600, 1200],
    [3024, 4032, 1200, 1600],
    [800, 600, 800, 600],
    [2000, 2000, 1600, 1600],
    [1600, 900, 1600, 900],
    [10000, 3, 1600, 1],
  ])('%i x %i -> %i x %i', (w, h, expectedW, expectedH) => {
    expect(fitWithin(w, h)).toEqual({ width: expectedW, height: expectedH })
  })
})

describe('classifyFile', () => {
  it('accepts images of any size and PDFs up to the limit', () => {
    expect(classifyFile({ type: 'image/jpeg', size: 1 })).toEqual({ kind: 'image' })
    expect(classifyFile({ type: 'image/heic', size: MAX_RECEIPT_BYTES * 3 })).toEqual({
      kind: 'image',
    })
    expect(classifyFile({ type: 'application/pdf', size: MAX_RECEIPT_BYTES })).toEqual({
      kind: 'pdf',
    })
  })

  it('rejects an oversized PDF', () => {
    expect(classifyFile({ type: 'application/pdf', size: MAX_RECEIPT_BYTES + 1 })).toEqual({
      error: PREPARE_MESSAGES.size,
    })
  })

  it.each(['text/plain', 'application/zip', ''])('rejects type %j', (type) => {
    expect(classifyFile({ type, size: 10 })).toEqual({ error: PREPARE_MESSAGES.type })
  })
})

describe('prepareReceipt encoding', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  /** Stubs the canvas so a WebP request returns `webpResult`; returns the requested types. */
  function stubCanvas(webpResult: string) {
    const requested: string[] = []
    vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 50, close() {} }))
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (resolve: (b: Blob) => void, type: string) => {
          requested.push(type)
          resolve(new Blob(['x'], { type: type === 'image/webp' ? webpResult : type }))
        },
      }),
    })
    return requested
  }

  const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

  it('keeps WebP when the browser can encode it', async () => {
    const requested = stubCanvas('image/webp')
    const { prepareReceipt } = await import('./receiptFile')
    expect((await prepareReceipt(photo())).type).toBe('image/webp')
    expect(requested).toEqual(['image/webp'])
  })

  it('falls back to JPEG when WebP comes back as PNG, and skips WebP after that', async () => {
    const requested = stubCanvas('image/png')
    const { prepareReceipt } = await import('./receiptFile')
    expect((await prepareReceipt(photo())).type).toBe('image/jpeg')
    expect((await prepareReceipt(photo())).type).toBe('image/jpeg')
    expect(requested).toEqual(['image/webp', 'image/jpeg', 'image/jpeg'])
  })
})
