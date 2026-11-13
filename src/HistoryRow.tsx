import { ChevronDown, FileText, Wrench } from 'lucide-react'
import { createElement } from 'react'
import { Table, TableBody, TableCell, TableFooter, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ServiceRecordView } from '../shared/api'
import { formatCents } from '../shared/money'
import { DeleteControl } from './ConfirmDelete'
import { formatDate } from './format'
import { HISTORY_COLUMNS, recordCost, recordServices } from './history'
import { serviceIcon } from './serviceIcons'

const money = (cents: number | null) => (cents === null ? '-' : formatCents(cents))
const miles = (n: number | null) => (n === null ? '-' : n.toLocaleString('en-US'))

function monthDay(iso: string) {
  return formatDate(iso).replace(/, \d{4}$/, '')
}

function Tags({ record }: { record: ServiceRecordView }) {
  const services = recordServices(record)
  if (services.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-1 text-xs leading-none font-semibold text-ink-2">
        <Wrench className="size-[13px]" aria-hidden />
        Other
      </span>
    )
  }
  return services.map((name) => (
    <span
      key={name}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-1 text-xs leading-none font-semibold text-brand-text"
    >
      {createElement(serviceIcon(name), { className: 'size-[13px]', 'aria-hidden': true })}
      {name}
    </span>
  ))
}

function ReceiptCell({ record, onView }: { record: ServiceRecordView; onView: () => void }) {
  const { receipt } = record
  const tile =
    'grid h-14 w-11 place-items-center overflow-hidden rounded-sm border border-line-strong bg-surface text-ink-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
  if (!receipt) return <span className="text-right text-[11px] leading-tight text-ink-3">No receipt</span>
  const url = `/api/receipts/${receipt.id}/file`
  if (receipt.contentType === 'application/pdf') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className={cn(tile, 'content-center gap-1 text-[10px] font-bold tracking-wide text-overdue')}
        aria-label={`Open receipt PDF from ${formatDate(record.date)} in a new tab`}
      >
        <FileText className="size-[18px] text-ink-3" aria-hidden />
        PDF
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={onView}
      className={cn(tile, 'cursor-zoom-in')}
      aria-label={`View receipt from ${formatDate(record.date)}`}
    >
      <img src={url} alt="" loading="lazy" className="size-full object-cover" />
    </button>
  )
}

interface HistoryRowProps {
  record: ServiceRecordView
  expanded: boolean
  onToggle: () => void
  onViewReceipt: () => void
  onDeleted: () => void
}

export function HistoryRow({ record, expanded, onToggle, onViewReceipt, onDeleted }: HistoryRowProps) {
  const cost = recordCost(record)
  const detailId = `record-${record.id}-detail`
  const description = record.items
    .filter((i) => i.amountCents !== 0)
    .map((i) => i.description)
    .join(' · ')
  const source = record.source === 'receipt' ? 'From receipt' : record.source === 'import' ? 'Imported' : 'Entered by hand'

  return (
    <li className="border-b border-line">
      <div className={cn('flex items-center gap-3 rounded-sm pr-3 hover:bg-surface-2', expanded && 'rounded-b-none bg-surface-2')}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className={cn(
            'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-sm p-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:items-center md:gap-4',
            HISTORY_COLUMNS,
          )}
        >
          <span className="flex items-baseline gap-1.5 md:block">
            <span className="font-bold">{monthDay(record.date)}</span>
            <span className="text-xs text-ink-3 md:block">{record.date.slice(0, 4)}</span>
          </span>
          <span className="col-start-1 row-start-2 grid min-w-0 gap-1 md:col-start-auto md:row-start-auto">
            <span className="flex flex-wrap gap-1.5">
              <Tags record={record} />
            </span>
            {description && <span className="truncate text-[13px] text-ink-3">{description}</span>}
          </span>
          <span className="col-start-1 row-start-3 min-w-0 truncate text-xs text-ink-3 md:col-start-auto md:row-start-auto md:text-sm md:text-ink">
            {record.shop ?? <span className="text-ink-3">Shop not recorded</span>}
            <span className="hidden text-[11px] text-ink-3 md:block">{source}</span>
            <span className="md:hidden"> · {miles(record.odometer)} mi</span>
          </span>
          <span className="hidden text-right text-sm md:block">{miles(record.odometer)}</span>
          <span className="col-start-2 row-start-1 text-right text-sm font-semibold md:col-start-auto md:row-start-auto md:font-normal">
            {money(cost)}
          </span>
          <ChevronDown
            className={cn('col-start-2 row-start-2 size-4 justify-self-end text-ink-3 transition-transform md:hidden', expanded && 'rotate-180')}
            aria-hidden
          />
        </button>
        <div className="flex w-[52px] shrink-0 justify-end">
          <ReceiptCell record={record} onView={onViewReceipt} />
        </div>
      </div>
      {expanded && (
        <div id={detailId} className="mb-2 rounded-b-sm bg-surface-2 px-3 pb-4">
          <div className="overflow-hidden rounded-sm border border-line bg-surface">
            <Table>
              <TableBody>
                {record.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">{item.description}</TableCell>
                    <TableCell className="text-xs text-ink-3">{item.serviceName ?? 'Other'}</TableCell>
                    <TableCell className="text-right">{money(item.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-surface">
                <TableRow>
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-bold">{money(cost)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
            <span>
              {formatDate(record.date)} · {miles(record.odometer)} mi · {source}
            </span>
            <DeleteControl
              url={`/api/service-records/${record.id}`}
              label={`service on ${formatDate(record.date)}`}
              onDeleted={onDeleted}
              showText
            />
          </div>
        </div>
      )}
    </li>
  )
}
