import { Receipt } from 'lucide-react'
import { createElement } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NextDueView, Vehicle, VehiclesResponse } from '../shared/api'
import { describeCountdown } from '../shared/scheduleView'
import { useApi } from './api'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { describeMileage, formatDate, SCHEDULE_LABELS, statusLabel } from './format'
import { Link } from './Link'
import { serviceIcon } from './serviceIcons'
import { StatusChip } from './StatusChip'
import { VehiclePhoto } from './VehiclePhoto'

const TINT = {
  overdue: 'bg-overdue-soft text-overdue',
  soon: 'bg-soon-soft text-soon',
  ok: 'bg-ok-soft text-ok',
  unknown: 'bg-surface text-ink-3',
}

const WHEN_TINT = { overdue: 'text-overdue', soon: 'text-soon', ok: 'text-ink', unknown: 'text-ink-3' }

function whenText(next: NextDueView): { main: string; sub: string } {
  // A Minder code means the car is asking now; the interval countdown would contradict it.
  if (next.minder) return { main: statusLabel(next.status, true), sub: `since ${formatDate(next.minder.date)}` }
  if (next.countdown) {
    const { value, unit } = describeCountdown(next.countdown)
    return { main: `${value} ${unit.split(' ')[0]}`, sub: unit.split(' ').slice(1).join(' ') }
  }
  return { main: statusLabel(next.status, true), sub: '' }
}

function NextDue({ next }: { next: NextDueView | null }) {
  if (!next) {
    return (
      <p className="rounded-md bg-surface-2 px-4 py-3 text-sm text-ink-3">
        Set last done on the schedule to see what's next.
      </p>
    )
  }
  const { main, sub } = whenText(next)
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
      <span className={cn('grid size-[38px] shrink-0 place-items-center rounded-sm', TINT[next.status])}>
        {createElement(serviceIcon(next.serviceName), { className: 'size-[22px]', 'aria-hidden': true })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Next due{next.minder && ` · Minder ${next.minder.code}`}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          {next.serviceName}
          {!next.minder && next.countdown && (
            <StatusChip status={next.status} className="px-2 py-1 text-[10px]">
              {statusLabel(next.status, true)}
            </StatusChip>
          )}
        </p>
      </div>
      <p className={cn('text-right text-sm font-bold', WHEN_TINT[next.status])}>
        {main}
        {sub && <span className="block text-xs font-medium text-ink-3">{sub}</span>}
      </p>
    </div>
  )
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { mileage, attention } = vehicle
  const { detail } = describeMileage(mileage)
  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-card shadow-card transition-colors hover:border-line-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <VehiclePhoto name={vehicle.name} className="aspect-video">
        {attention && (attention.overdue > 0 || attention.soon > 0) && (
          <div className="absolute top-3.5 left-3.5 flex gap-1.5 [&>span]:backdrop-blur-sm">
            {attention.overdue > 0 && <StatusChip status="overdue">{`${attention.overdue} overdue`}</StatusChip>}
            {attention.soon > 0 && <StatusChip status="soon">{`${attention.soon} soon`}</StatusChip>}
          </div>
        )}
      </VehiclePhoto>
      <div className="grid gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold">{vehicle.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">{SCHEDULE_LABELS[vehicle.scheduleModel]}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-[0.12em] text-ink-3 uppercase">ODO</p>
            <p className="mt-1 text-2xl font-bold">
              {mileage ? mileage.estimate.toLocaleString('en-US') : '-'}
            </p>
            <p className="text-[11px] text-ink-3">{mileage ? detail : 'No mileage logged'}</p>
          </div>
        </div>
        <NextDue next={vehicle.nextDue} />
      </div>
    </Link>
  )
}

function summary(vehicles: Vehicle[]): string {
  const overdue = vehicles.reduce((n, v) => n + (v.attention?.overdue ?? 0), 0)
  const soon = vehicles.reduce((n, v) => n + (v.attention?.soon ?? 0), 0)
  const count = `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`
  if (overdue === 0 && soon === 0) return `Nothing due across ${count}.`
  const parts = [
    overdue ? `${overdue} ${overdue === 1 ? 'item' : 'items'} overdue` : null,
    soon ? `${soon} due soon` : null,
  ].filter(Boolean)
  return `${parts.join(', ')} across ${count}.`
}

export function HomePage() {
  const { state, retry } = useApi<VehiclesResponse>('/api/vehicles')

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[34px] font-bold">Garage</h1>
        {state.status === 'ready' && state.data.vehicles.length > 0 && (
          <p className="mt-1 text-ink-2">{summary(state.data.vehicles)}</p>
        )}
      </div>
      {state.status === 'loading' && <LoadingMessage>Loading vehicles...</LoadingMessage>}
      {(state.status === 'error' || state.status === 'notFound') && (
        <ErrorPanel message="Couldn't load your vehicles." onRetry={retry} />
      )}
      {state.status === 'ready' && state.data.vehicles.length === 0 && (
        <p className="text-ink-3">No vehicles found.</p>
      )}
      {state.status === 'ready' && state.data.vehicles.length > 0 && (
        <ul className="grid gap-6 md:grid-cols-2">
          {state.data.vehicles.map((vehicle) => (
            <li key={vehicle.id} className="grid">
              <VehicleCard vehicle={vehicle} />
            </li>
          ))}
        </ul>
      )}
      <Button
        asChild
        size="lg"
        className="fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 shadow-drawer"
      >
        <Link href="/receipts/new">
          <Receipt aria-hidden />
          Add receipt
        </Link>
      </Button>
    </>
  )
}
