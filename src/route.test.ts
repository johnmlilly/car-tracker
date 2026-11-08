import { describe, expect, it } from 'vitest'
import { matchRoute } from './route'

describe('matchRoute', () => {
  it('matches home and vehicle routes', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' })
    expect(matchRoute('/vehicles/2')).toEqual({ name: 'vehicle', id: 2 })
    expect(matchRoute('/vehicles/2/')).toEqual({ name: 'vehicle', id: 2 })
  })
  it('matches the odometer route', () => {
    expect(matchRoute('/vehicles/1/odometer')).toEqual({ name: 'odometer', id: 1 })
    expect(matchRoute('/vehicles/1/odometer/')).toEqual({ name: 'odometer', id: 1 })
  })
  it('matches the minder route', () => {
    expect(matchRoute('/vehicles/1/minder')).toEqual({ name: 'minder', id: 1 })
    expect(matchRoute('/vehicles/1/minder/')).toEqual({ name: 'minder', id: 1 })
  })
  it.each(['/vehicles/0/minder', '/vehicles/1/minder/x', '/vehicles/0', '/vehicles/abc', '/vehicles', '/nope', '/vehicles/0/odometer', '/vehicles/1/odometer/x'])('rejects %s', (path) => {
    expect(matchRoute(path)).toEqual({ name: 'notFound' })
  })
})
