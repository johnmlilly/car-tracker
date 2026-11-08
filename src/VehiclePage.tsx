import { useState } from 'react'
import type { DueItemView, ScheduleItemView, VehicleDetailResponse } from '../shared/api'
import { BaselineForm } from './BaselineForm'
import { formatDate, formatInterval, formatPoint } from './format'
import { Link } from './Link'
import { MileageText } from './MileageText'
import { PageShell } from './PageShell'
import { StatusBadge } from './StatusBadge'

interface RowProps {
  item: ScheduleItemView
  today: string
  onSaved: () => void
}

function ScheduleItemRow({ item, today, onSaved }: RowProps) {
  const [editing, setEditing] = useState(false)
  const hasBaseline = item.baselineDate !== null || item.baselineOdometer !== null
  const hasLastDone = item.lastDoneDate !== null || item.lastDoneOdometer !== null
  const lastDone = formatPoint(item.lastDoneDate, item.lastDoneOdometer, 'at')
  const nextDue = formatPoint(item.nextDueDate, item.nextDueMiles)

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{item.serviceName}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatInterval(item.intervalMiles, item.intervalMonths)}
          </p>
          {item.minderSince && (
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Minder {item.minderSince.code} on {formatDate(item.minderSince.date)}
            </p>
          )}
        </div>
        <StatusBadge status={item.status} hasBaseline={hasLastDone} />
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

function DueItemRow({ item }: { item: DueItemView }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{item.serviceName}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            From {item.since.code} on {formatDate(item.since.date)}
          </p>
        </div>
        <StatusBadge status={item.status} hasBaseline />
      </div>
    </li>
  )
}

const sectionHeadingClass = 'mb-2 text-lg font-medium'

function VehicleItems({ data, onSaved }: { data: VehicleDetailResponse; onSaved: () => void }) {
  const isMinder = data.vehicle.scheduleModel === 'minder'
  if (data.items.length === 0 && data.dueItems.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400">
        {isMinder
          ? 'Nothing due. Log a code when the car shows one.'
          : 'No interval schedule for this vehicle.'}
      </p>
    )
  }
  return (
    <div className="grid gap-6">
      {data.dueItems.length > 0 && (
        <section>
          <h2 className={sectionHeadingClass}>From Minder codes</h2>
          <ul className="grid gap-3">
            {data.dueItems.map((item) => (
              <DueItemRow key={item.serviceName} item={item} />
            ))}
          </ul>
        </section>
      )}
      {data.items.length > 0 && (
        <section>
          {isMinder && <h2 className={sectionHeadingClass}>Schedule</h2>}
          <ul className="grid gap-3">
            {data.items.map((item) => (
              <ScheduleItemRow key={item.id} item={item} today={data.today} onSaved={onSaved} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function VehiclePage({ id }: { id: number }) {
  return (
    <PageShell<VehicleDetailResponse>
      url={`/api/vehicles/${id}`}
      loadingText="Loading schedule..."
      errorText="Couldn't load this vehicle."
    >
      {(data, refresh) => (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
          <div className="mb-6 flex items-end justify-between gap-3">
            <MileageText mileage={data.vehicle.mileage} />
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Link
                href={`/vehicles/${id}/services`}
                className="text-sm font-medium underline underline-offset-2"
              >
                Add service
              </Link>
              {data.vehicle.scheduleModel === 'minder' && (
                <Link
                  href={`/vehicles/${id}/minder`}
                  className="text-sm font-medium underline underline-offset-2"
                >
                  Log Minder code
                </Link>
              )}
              <Link
                href={`/vehicles/${id}/odometer`}
                className="text-sm font-medium underline underline-offset-2"
              >
                Log odometer
              </Link>
            </div>
          </div>
          <VehicleItems data={data} onSaved={refresh} />
        </>
      )}
    </PageShell>
  )
}
