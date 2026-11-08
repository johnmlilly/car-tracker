import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'vehicle'; id: number }
  | { name: 'odometer'; id: number }
  | { name: 'minder'; id: number }
  | { name: 'notFound' }

export function matchRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' }
  const vehicle = /^\/vehicles\/([1-9]\d{0,9})\/?$/.exec(pathname)
  if (vehicle) return { name: 'vehicle', id: Number(vehicle[1]) }
  const odometer = /^\/vehicles\/([1-9]\d{0,9})\/odometer\/?$/.exec(pathname)
  if (odometer) return { name: 'odometer', id: Number(odometer[1]) }
  const minder = /^\/vehicles\/([1-9]\d{0,9})\/minder\/?$/.exec(pathname)
  if (minder) return { name: 'minder', id: Number(minder[1]) }
  return { name: 'notFound' }
}

export function navigate(to: string) {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}
