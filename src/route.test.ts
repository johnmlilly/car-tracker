import { describe, expect, it } from 'vitest'
import { matchRoute, vehicleParam } from './route'

describe('matchRoute', () => {
  it('matches home and vehicle routes', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' })
    expect(matchRoute('/vehicles/2')).toEqual({ name: 'vehicle', id: 2 })
    expect(matchRoute('/vehicles/2/')).toEqual({ name: 'vehicle', id: 2 })
  })
  it('sends the old odometer and minder pages to the vehicle page', () => {
    expect(matchRoute('/vehicles/1/odometer')).toEqual({ name: 'vehicle', id: 1 })
    expect(matchRoute('/vehicles/1/odometer/')).toEqual({ name: 'vehicle', id: 1 })
    expect(matchRoute('/vehicles/1/minder')).toEqual({ name: 'vehicle', id: 1 })
    expect(matchRoute('/vehicles/1/minder/')).toEqual({ name: 'vehicle', id: 1 })
  })
  it('matches the services route', () => {
    expect(matchRoute('/vehicles/2/services')).toEqual({ name: 'services', id: 2 })
    expect(matchRoute('/vehicles/2/services/')).toEqual({ name: 'services', id: 2 })
  })
  it('matches the receipt routes', () => {
    expect(matchRoute('/receipts')).toEqual({ name: 'receipts' })
    expect(matchRoute('/receipts/')).toEqual({ name: 'receipts' })
    expect(matchRoute('/receipts/new')).toEqual({ name: 'receiptNew' })
    expect(matchRoute('/receipts/new/')).toEqual({ name: 'receiptNew' })
    expect(matchRoute('/receipts/12/review')).toEqual({ name: 'receiptReview', id: 12 })
    expect(matchRoute('/receipts/12/review/')).toEqual({ name: 'receiptReview', id: 12 })
  })
  it.each(['/receipts/0/review', '/receipts/abc/review', '/receipts/1/review/x', '/receipts/1', '/receipts/new/x', '/receiptsx', '/vehicles/0/services', '/vehicles/2/services/x', '/vehicles/0/minder', '/vehicles/1/minder/x', '/vehicles/0', '/vehicles/abc', '/vehicles', '/nope', '/vehicles/0/odometer', '/vehicles/1/odometer/x'])('rejects %s', (path) => {
    expect(matchRoute(path)).toEqual({ name: 'notFound' })
  })
})

describe('vehicleParam', () => {
  it('reads a vehicle id from the query', () => {
    expect(vehicleParam('?vehicle=2')).toBe(2)
    expect(vehicleParam('?x=1&vehicle=12')).toBe(12)
  })
  it.each(['', '?vehicle=', '?vehicle=0', '?vehicle=abc', '?vehicle=1.5', '?vehicle=-2'])('ignores %s', (search) => {
    expect(vehicleParam(search)).toBeNull()
  })
})
