import { useState } from 'react'
import type { ScheduleItemView, VehicleDetailResponse } from '../shared/api'
import { useApi } from './api'
import { BaselineForm } from './BaselineForm'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { formatInterval, formatPoint } from './format'
import { Link } from './Link'
import { StatusBadge } from './StatusBadge'

interface RowProps {
  item: ScheduleItemView
  today: string
  onSaved: () => void
}

function ScheduleItemRow({ item, today, onSaved }: RowProps) {
  const [editing, setEditing] = useState(false)
  const hasBaseline = item.baselineDate !== null || item.baselineOdometer !== null
  const lastDone = formatPoint(item.baselineDate, item.baselineOdometer, 'at')
  const nextDue = formatPoint(item.nextDueDate, item.nextDueMiles)

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{item.serviceName}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatInterval(item.intervalMiles, item.intervalMonths)}
          </p>
        </div>
        <StatusBadge status={item.status} hasBaseline={hasBaseline} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">Last done</dt>
        <dd>{lastDone ?? 'Not set'}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Next due</dt>
        <dd>{nextDue ?? 'Unknown'}</dd>
      </dl>
      {editing ? (
        <BaselineForm
          item={item}
          today={today}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onSaved()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-sm font-medium underline underline-offset-2"
          aria-label={`${hasBaseline ? 'Edit' : 'Set'} last done for ${item.serviceName}`}
        >
          {hasBaseline ? 'Edit last done' : 'Set last done'}
        </button>
      )}
    </li>
  )
}

export function VehiclePage({ id }: { id: number }) {
  const { state, retry, refresh } = useApi<VehicleDetailResponse>(`/api/vehicles/${id}`)

  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← All vehicles
      </Link>
      {state.status === 'loading' && <LoadingMessage>Loading schedule...</LoadingMessage>}
      {state.status === 'error' && (
        <ErrorPanel message="Couldn't load this vehicle." onRetry={retry} />
      )}
      {state.status === 'notFound' && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Vehicle not found</h1>
          <p className="text-zinc-500 dark:text-zinc-400">There's no vehicle at this address.</p>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <h1 className="mb-6 text-2xl font-semibold">{state.data.vehicle.name}</h1>
          {state.data.items.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              No interval schedule for this vehicle.
            </p>
          ) : (
            <ul className="grid gap-3">
              {state.data.items.map((item) => (
                <ScheduleItemRow
                  key={item.id}
                  item={item}
                  today={state.data.today}
                  onSaved={refresh}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
