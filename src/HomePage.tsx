import type { Vehicle, VehiclesResponse } from '../shared/api'
import { useApi } from './api'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { Link } from './Link'
import { MileageText } from './MileageText'

const SCHEDULE_LABELS: Record<Vehicle['scheduleModel'], string> = {
  minder: 'Maintenance Minder',
  interval: 'Interval schedule',
}

function attentionText(attention: Vehicle['attention']): string | null {
  if (!attention) return null
  const parts = [
    attention.overdue ? `${attention.overdue} overdue` : null,
    attention.soon ? `${attention.soon} due soon` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const attention = attentionText(vehicle.attention)
  // Only interval vehicles have a detail screen so far; Minder logging comes later.
  const title =
    vehicle.scheduleModel === 'interval' ? (
      <Link
        href={`/vehicles/${vehicle.id}`}
        className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2"
      >
        {vehicle.name}
      </Link>
    ) : (
      vehicle.name
    )

  return (
    <div
      className={`relative rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
        vehicle.scheduleModel === 'interval' ? 'hover:border-zinc-400 dark:hover:border-zinc-600' : ''
      }`}
    >
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {SCHEDULE_LABELS[vehicle.scheduleModel]}
      </p>
      {attention && (
        <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{attention}</p>
      )}
      <div className="mt-3 flex items-end justify-between gap-3">
        <MileageText mileage={vehicle.mileage} />
        <Link
          href={`/vehicles/${vehicle.id}/odometer`}
          className="relative z-10 shrink-0 text-sm font-medium underline underline-offset-2"
          aria-label={`Log odometer for ${vehicle.name}`}
        >
          Log odometer
        </Link>
      </div>
    </div>
  )
}

export function HomePage() {
  const { state, retry } = useApi<VehiclesResponse>('/api/vehicles')

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Car Tracker</h1>
      {state.status === 'loading' && <LoadingMessage>Loading vehicles...</LoadingMessage>}
      {(state.status === 'error' || state.status === 'notFound') && (
        <ErrorPanel message="Couldn't load your vehicles." onRetry={retry} />
      )}
      {state.status === 'ready' && state.data.vehicles.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">No vehicles found.</p>
      )}
      {state.status === 'ready' && state.data.vehicles.length > 0 && (
        <ul className="grid gap-4">
          {state.data.vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <VehicleCard vehicle={vehicle} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
