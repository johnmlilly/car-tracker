import { useEffect, useState } from 'react'
import type { ScheduleModel, Vehicle, VehiclesResponse } from '../shared/api'

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; vehicles: Vehicle[] }

const SCHEDULE_LABELS: Record<ScheduleModel, string> = {
  minder: 'Maintenance Minder',
  interval: 'Interval schedule',
}

async function fetchVehicles(signal?: AbortSignal): Promise<Vehicle[]> {
  const res = await fetch('/api/vehicles', { signal })
  if (!res.ok) throw new Error(`GET /api/vehicles failed: ${res.status}`)
  const body = (await res.json()) as VehiclesResponse
  return body.vehicles
}

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchVehicles(controller.signal).then(
      (vehicles) => setState({ status: 'ready', vehicles }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        console.error(err)
        setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <div className="min-h-svh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold">Car Tracker</h1>

        {state.status === 'loading' && (
          <p className="text-zinc-500 dark:text-zinc-400" role="status">
            Loading vehicles...
          </p>
        )}

        {state.status === 'error' && (
          <div role="alert" className="rounded-lg border border-red-300 p-4 dark:border-red-800">
            <p className="mb-3">Couldn't load your vehicles.</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.vehicles.length === 0 && (
          <p className="text-zinc-500 dark:text-zinc-400">No vehicles found.</p>
        )}

        {state.status === 'ready' && state.vehicles.length > 0 && (
          <ul className="grid gap-4">
            {state.vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <h2 className="text-lg font-medium">{vehicle.name}</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {SCHEDULE_LABELS[vehicle.scheduleModel]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default App
