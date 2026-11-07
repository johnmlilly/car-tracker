import { useState } from 'react'
import type { OdometerReading, OdometerResponse } from '../shared/api'
import { apiRequest, useApi } from './api'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { formatDate, formatMiles } from './format'
import { Link } from './Link'
import { MileageText } from './MileageText'
import { OdometerForm } from './OdometerForm'
import { buttonClass, errorTextClass } from './styles'

function ReadingRow({ reading, onDeleted }: { reading: OdometerReading; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = `${formatMiles(reading.odometer)} on ${formatDate(reading.date)}`

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await apiRequest<void>(`/api/odometer-logs/${reading.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      console.error(err)
      setError("Couldn't delete. Try again.")
      setDeleting(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{formatMiles(reading.odometer)}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatDate(reading.date)}</p>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className={`${buttonClass} bg-red-700 text-white dark:bg-red-400 dark:text-zinc-950`}
              aria-label={`Confirm delete ${label}`}
            >
              {deleting ? 'Deleting...' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className={`${buttonClass} border border-zinc-300 dark:border-zinc-700`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm font-medium text-red-700 underline underline-offset-2 dark:text-red-300"
            aria-label={`Delete ${label}`}
          >
            Delete
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={`mt-1 ${errorTextClass}`}>
          {error}
        </p>
      )}
    </li>
  )
}

function OdometerContent({ data, onChange }: { data: OdometerResponse; onChange: () => void }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
      <div className="mb-6">
        <MileageText mileage={data.mileage} />
      </div>
      <h2 className="mb-2 text-lg font-medium">Log odometer</h2>
      <OdometerForm vehicleId={data.vehicle.id} today={data.today} onSaved={onChange} />
      <h2 className="mt-8 mb-1 text-lg font-medium">Readings</h2>
      {data.readings.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No readings yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.readings.map((reading) => (
            <ReadingRow key={reading.id} reading={reading} onDeleted={onChange} />
          ))}
        </ul>
      )}
    </>
  )
}

export function OdometerPage({ id }: { id: number }) {
  const { state, retry, refresh } = useApi<OdometerResponse>(`/api/vehicles/${id}/odometer`)

  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← All vehicles
      </Link>
      {state.status === 'loading' && <LoadingMessage>Loading readings...</LoadingMessage>}
      {state.status === 'error' && (
        <ErrorPanel message="Couldn't load odometer readings." onRetry={retry} />
      )}
      {state.status === 'notFound' && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Vehicle not found</h1>
          <p className="text-zinc-500 dark:text-zinc-400">There's no vehicle at this address.</p>
        </>
      )}
      {state.status === 'ready' && <OdometerContent data={state.data} onChange={refresh} />}
    </>
  )
}
