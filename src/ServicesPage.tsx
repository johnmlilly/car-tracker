import { Plus, Search, Wrench } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ServiceRecordView, ServiceRecordsResponse } from '../shared/api'
import { formatCents } from '../shared/money'
import { formatDate } from './format'
import {
  filterRecords,
  groupByYear,
  HISTORY_COLUMNS,
  historyStats,
  NO_FILTER,
  recordCost,
  SERVICE_GROUPS,
  type HistoryFilter,
  type ServiceGroup,
} from './history'
import { HistoryRow } from './HistoryRow'
import { PageShell } from './PageShell'
import { ReceiptViewer } from './ReceiptViewer'
import { ResponsiveDrawer } from './ResponsiveDrawer'
import { ServiceForm } from './ServiceForm'
import { useDrawer } from './useDrawer'

function Stats({ records }: { records: ServiceRecordView[] }) {
  const stats = historyStats(records)
  const items: [string, string][] = [
    ['Services', String(stats.services)],
    ['Spent', formatCents(stats.spentCents)],
    ['Last service', stats.lastDate ? formatDate(stats.lastDate) : '-'],
    ['Receipts', `${stats.receipts} of ${stats.services}`],
  ]
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] leading-none font-bold tracking-[0.12em] text-ink-3 uppercase">{k}</dt>
          <dd className="mt-1 text-lg font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Filters({ filter, onChange }: { filter: HistoryFilter; onChange: (f: HistoryFilter) => void }) {
  const id = useId()
  const chip = (label: string, group: ServiceGroup | null) => (
    <button
      key={label}
      type="button"
      aria-pressed={filter.group === group}
      onClick={() => onChange({ ...filter, group })}
      className="rounded-full border border-line bg-surface px-3 py-2 text-[13px] leading-none font-semibold text-ink-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-transparent aria-pressed:bg-ink aria-pressed:text-background"
    >
      {label}
    </button>
  )
  return (
    <div role="group" aria-label="Filter services" className="mb-5 flex flex-wrap items-center gap-2">
      <div className="relative flex-[1_1_220px] sm:max-w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          type="search"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          placeholder="Search work, shop"
          aria-label="Search service history"
          className="rounded-full bg-surface pl-9"
        />
      </div>
      {chip('All', null)}
      {SERVICE_GROUPS.map((g) => chip(g, g))}
      <div className="flex items-center gap-2 sm:ml-auto">
        <Checkbox
          id={`${id}-receipt`}
          checked={filter.hasReceipt}
          onCheckedChange={(checked) => onChange({ ...filter, hasReceipt: checked === true })}
        />
        <Label htmlFor={`${id}-receipt`} className="text-[13px] font-normal text-ink-2">
          Has receipt
        </Label>
      </div>
    </div>
  )
}

function Records({
  records,
  onClear,
  onChanged,
}: {
  records: ServiceRecordView[]
  onClear: () => void
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const viewer = useDrawer<ServiceRecordView>()

  if (records.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-ink-3">
        No services match.{' '}
        <Button type="button" variant="link" onClick={onClear}>
          Clear filters
        </Button>
      </p>
    )
  }

  function toggle(id: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const shown = viewer.value
  return (
    <>
      {groupByYear(records).map((year) => (
        <section key={year.year} className="mb-8" aria-labelledby={`year-${year.year}`}>
          <div className="flex items-baseline justify-between border-b border-line-strong px-1 pb-2">
            <h2 id={`year-${year.year}`} className="text-[22px] font-bold">
              {year.year}
            </h2>
            <span className="text-[13px] text-ink-3">
              {year.records.length} {year.records.length === 1 ? 'service' : 'services'} ·{' '}
              {formatCents(year.totalCents)}
            </span>
          </div>
          <div
            aria-hidden
            className="hidden items-center gap-4 pt-3 pr-3 pb-2 text-[10px] leading-none font-bold tracking-[0.12em] text-ink-3 uppercase md:flex"
          >
            <div className={cn('grid flex-1 gap-4 px-3', HISTORY_COLUMNS)}>
              <span>Date</span>
              <span>Work done</span>
              <span>Shop</span>
              <span className="text-right">Miles</span>
              <span className="text-right">Cost</span>
            </div>
            <span className="w-[52px] text-right">Receipt</span>
          </div>
          <ul>
            {year.records.map((record) => (
              <HistoryRow
                key={record.id}
                record={record}
                expanded={expanded.has(record.id)}
                onToggle={() => toggle(record.id)}
                onViewReceipt={() => viewer.show(record)}
                onDeleted={onChanged}
              />
            ))}
          </ul>
        </section>
      ))}
      <ReceiptViewer
        receiptId={shown?.receipt?.id ?? null}
        caption={
          shown
            ? [formatDate(shown.date), shown.shop, recordCost(shown) !== null ? formatCents(recordCost(shown)!) : null]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        open={viewer.open}
        onOpenChange={viewer.setOpen}
      />
    </>
  )
}

function ServicesContent({ data, onChange }: { data: ServiceRecordsResponse; onChange: () => void }) {
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER)
  const [adding, setAdding] = useState(false)

  return (
    <>
      <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold sm:text-[32px]">Service history</h1>
          <p className="mt-0.5 text-sm text-ink-3">{data.vehicle.name} · every service on record, newest first</p>
          {data.records.length > 0 && <Stats records={data.records} />}
        </div>
        <Button type="button" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add service
        </Button>
      </section>
      {data.records.length === 0 ? (
        <p className="text-ink-3">No services recorded yet.</p>
      ) : (
        <>
          <Filters filter={filter} onChange={setFilter} />
          <Records
            records={filterRecords(data.records, filter)}
            onClear={() => setFilter(NO_FILTER)}
            onChanged={onChange}
          />
        </>
      )}
      <ResponsiveDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add service"
        subtitle={data.vehicle.name}
        icon={Wrench}
      >
        <ServiceForm
          vehicleId={data.vehicle.id}
          today={data.today}
          services={data.services}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onChange()
          }}
        />
      </ResponsiveDrawer>
    </>
  )
}

export function ServicesPage({ id }: { id: number }) {
  return (
    <PageShell<ServiceRecordsResponse>
      url={`/api/vehicles/${id}/service-records`}
      loadingText="Loading service history..."
      errorText="Couldn't load service history."
      backHref={`/vehicles/${id}`}
      backLabel="Schedule"
    >
      {(data, refresh) => <ServicesContent data={data} onChange={refresh} />}
    </PageShell>
  )
}
