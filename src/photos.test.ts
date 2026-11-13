import { describe, expect, it } from 'vitest'
import { vehiclePhotoUrl, vehicleSlug } from './photos'

describe('vehicleSlug', () => {
  it('builds the photo filename stem from a vehicle name', () => {
    expect(vehicleSlug('2024 Honda Odyssey')).toBe('2024-honda-odyssey')
    expect(vehicleSlug('2019 Toyota Corolla')).toBe('2019-toyota-corolla')
  })

  it('collapses punctuation and trims edge separators', () => {
    expect(vehicleSlug('  2019 Toyota Corolla (LE)!  ')).toBe('2019-toyota-corolla-le')
    expect(vehicleSlug('Mazda  CX-5')).toBe('mazda-cx-5')
  })
})

describe('vehiclePhotoUrl', () => {
  it('finds the bundled photo for a known vehicle and null otherwise', () => {
    expect(vehiclePhotoUrl('2024 Honda Odyssey')).toMatch(/2024-honda-odyssey/)
    expect(vehiclePhotoUrl('1999 Unknown Car')).toBeNull()
  })
})
