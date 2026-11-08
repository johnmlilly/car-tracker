import { useState } from 'react'
import type { MinderLogView, MinderResponse } from '../shared/api'
import { apiRequest, useApi } from './api'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { formatDate, formatMiles } from './format'
import { Link } from './Link'
import { MileageText } from './MileageText'
import { MinderForm } from './MinderForm'
import { buttonClass, errorTextClass } from './styles'

function LogRow({ log, onDeleted }: { log: MinderLogView; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = `code ${log.code} on ${formatDate(log.date)}`

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await apiRequest<void>(`/api/minder-logs/${log.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      console.error(err)
      setError("Couldn't delete. Try again.")
      setDeleting(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{log.code}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatDate(log.date)}
            {log.odometer !== null && ` at ${formatMiles(log.odometer)}`}
          </p>
          <p className="mt-1 text-sm">{log.services.join(', ')}</p>
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-2">
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
            className="shrink-0 text-sm font-medium text-red-700 underline underline-offset-2 dark:text-red-300"
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

function MinderContent({ data, onChange }: { data: MinderResponse; onChange: () => void }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
      <div className="mb-6">
        <MileageText mileage={data.mileage} />
      </div>
      <h2 className="mb-2 text-lg font-medium">Log Minder code</h2>
      <MinderForm vehicleId={data.vehicle.id} onSaved={onChange} />
      <h2 className="mt-8 mb-1 text-lg font-medium">Logged codes</h2>
      {data.logs.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No codes logged yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.logs.map((log) => (
            <LogRow key={log.id} log={log} onDeleted={onChange} />
          ))}
        </ul>
      )}
    </>
  )
}

export function MinderPage({ id }: { id: number }) {
  const { state, retry, refresh } = useApi<MinderResponse>(`/api/vehicles/${id}/minder`)

  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← All vehicles
      </Link>
      {state.status === 'loading' && <LoadingMessage>Loading Minder codes...</LoadingMessage>}
      {state.status === 'error' && (
        <ErrorPanel message="Couldn't load Minder codes." onRetry={retry} />
      )}
      {state.status === 'notFound' && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Vehicle not found</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            There's no Maintenance Minder vehicle at this address.
          </p>
        </>
      )}
      {state.status === 'ready' && <MinderContent data={state.data} onChange={refresh} />}
    </>
  )
}
