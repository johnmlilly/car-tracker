import { Pencil } from 'lucide-react'
import { createElement, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ItemStatus } from '../shared/api'
import { daysBetween } from '../shared/schedule'
import { barFraction, describeCountdown, type Countdown, type GridEntry } from '../shared/scheduleView'
import { formatDate, formatInterval, formatPoint, statusLabel } from './format'
import { serviceIcon } from './serviceIcons'
import { MinderChip, StatusChip } from './StatusChip'

const ACCENT: Record<ItemStatus, string> = {
  overdue: 'before:bg-overdue',
  soon: 'before:bg-soon-bar',
  ok: '',
  unknown: '',
}

const ICON_TINT: Record<ItemStatus, string> = {
  overdue: 'bg-overdue-soft text-overdue',
  soon: 'bg-soon-soft text-soon',
  ok: 'bg-ok-soft text-ok',
  unknown: 'bg-surface-2 text-ink-2',
}

const NUMBER_TINT: Record<ItemStatus, string> = {
  overdue: 'text-overdue',
  soon: 'text-soon',
  ok: '',
  unknown: 'text-ink-3 text-[22px]',
}

const BAR_TINT: Record<ItemStatus, string> = {
  overdue: 'bg-overdue',
  soon: 'bg-soon-bar',
  ok: 'bg-ok',
  unknown: 'bg-transparent',
}

function Big({ status, value, unit }: { status: ItemStatus; value: string; unit?: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className={cn('text-[34px] leading-none font-bold tracking-tight', NUMBER_TINT[status])}>
        {value}
      </span>
      {unit && <span className="font-semibold text-ink-2">{unit}</span>}
    </p>
  )
}

function Bar({ status, fraction, start, end }: { status: ItemStatus; fraction: number; start: string; end: string }) {
  return (
    <div className="mt-2.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn('block h-full rounded-full', BAR_TINT[status])}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </div>
  )
}

function endpoints(c: Countdown): [string, string] {
  return c.kind === 'miles'
    ? [c.from.toLocaleString('en-US'), c.to.toLocaleString('en-US')]
    : [formatDate(c.from), formatDate(c.to)]
}

function minderText(code: string, date: string) {
  return `Minder ${code} · ${formatDate(date)}`
}

function Shell({
  status,
  name,
  subtitle,
  chip,
  middle,
  footer,
}: {
  status: ItemStatus
  name: string
  subtitle: string
  chip: string
  middle: ReactNode
  footer: ReactNode
}) {
  return (
    <li
      className={cn(
        'relative grid gap-4 overflow-hidden rounded-lg border border-line bg-card p-5 shadow-card before:absolute before:inset-y-0 before:left-0 before:w-1',
        ACCENT[status],
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid size-[42px] shrink-0 place-items-center rounded-md', ICON_TINT[status])}>
          {createElement(serviceIcon(name), { className: 'size-[22px]', 'aria-hidden': true })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{name}</h3>
          <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>
        </div>
        <StatusChip status={status}>{chip}</StatusChip>
      </div>
      <div>{middle}</div>
      {footer}
    </li>
  )
}

interface ServiceCardProps {
  entry: GridEntry
  today: string
  onEditLastDone: () => void
}

/** One schedule card: countdown, interval bar, last done / next due, and edit. */
export function ServiceCard({ entry, today, onEditLastDone }: ServiceCardProps) {
  if (entry.kind === 'minder') {
    const { item } = entry
    return (
      <Shell
        status={item.status}
        name={item.serviceName}
        subtitle="From the Maintenance Minder"
        chip={statusLabel(item.status, true)}
        middle={
          <>
            <Big status={item.status} value={String(daysBetween(item.since.date, today))} unit="days since code" />
            <div className="mt-2.5">
              <MinderChip>{minderText(item.since.code, item.since.date)}</MinderChip>
            </div>
          </>
        }
        footer={null}
      />
    )
  }

  const { item, countdown } = entry
  const hasBaseline = item.baselineDate !== null || item.baselineOdometer !== null
  const hasLastDone = item.lastDoneDate !== null || item.lastDoneOdometer !== null
  const label = statusLabel(item.status, hasLastDone)

  let middle: ReactNode
  if (item.minderSince) {
    const interval = countdown ? describeCountdown(countdown) : null
    middle = (
      <>
        <Big status={item.status} value={String(daysBetween(item.minderSince.date, today))} unit="days since code" />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <MinderChip>{minderText(item.minderSince.code, item.minderSince.date)}</MinderChip>
          {interval && (
            <span className="text-xs text-ink-3">
              Interval: {interval.value} {interval.unit}
            </span>
          )}
        </div>
      </>
    )
  } else if (countdown) {
    const { value, unit } = describeCountdown(countdown)
    const [start, end] = endpoints(countdown)
    middle = (
      <>
        <Big status={item.status} value={value} unit={unit} />
        <Bar status={item.status} fraction={barFraction(countdown)} start={start} end={end} />
      </>
    )
  } else {
    middle = (
      <>
        <Big status="unknown" value={label} />
        <Bar
          status="unknown"
          fraction={0}
          start={hasLastDone ? 'Log odometer to track' : 'Set last done to track'}
          end=""
        />
      </>
    )
  }

  return (
    <Shell
      status={item.status}
      name={item.serviceName}
      subtitle={formatInterval(item.intervalMiles, item.intervalMonths)}
      chip={label}
      middle={middle}
      footer={
        <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
            <dt className="text-ink-3">Last done</dt>
            <dd>{formatPoint(item.lastDoneDate, item.lastDoneOdometer, 'at') ?? 'Not set'}</dd>
            <dt className="text-ink-3">Next due</dt>
            <dd>{formatPoint(item.nextDueDate, item.nextDueMiles) ?? 'Unknown'}</dd>
          </dl>
          {hasBaseline ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEditLastDone}
              aria-label={`Edit last done for ${item.serviceName}`}
            >
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEditLastDone}
              aria-label={`Set last done for ${item.serviceName}`}
            >
              <Pencil aria-hidden />
              Set
            </Button>
          )}
        </div>
      }
    />
  )
}
