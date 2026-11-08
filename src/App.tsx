import { HomePage } from './HomePage'
import { Link } from './Link'
import { OdometerPage } from './OdometerPage'
import { MinderPage } from './MinderPage'
import { matchRoute, usePathname } from './route'
import { VehiclePage } from './VehiclePage'

function NotFoundPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-sm underline">
        Go to all vehicles
      </Link>
    </>
  )
}

function App() {
  const route = matchRoute(usePathname())

  return (
    <div className="min-h-svh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-xl px-4 py-6">
        {route.name === 'home' && <HomePage />}
        {route.name === 'vehicle' && <VehiclePage key={route.id} id={route.id} />}
        {route.name === 'odometer' && <OdometerPage key={route.id} id={route.id} />}
        {route.name === 'minder' && <MinderPage key={route.id} id={route.id} />}
        {route.name === 'notFound' && <NotFoundPage />}
      </main>
    </div>
  )
}

export default App
