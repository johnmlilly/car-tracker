import { CircleCheck, ClipboardCheck, ExternalLink, FileText, Receipt, ScanText, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReceiptStatus, ReceiptView, ReceiptsResponse } from '../shared/api'
import { todayInEastern } from '../shared/schedule'
import { ApiError, apiRequest } from './api'
import { DeleteControl } from './ConfirmDelete'
import { formatDate } from './format'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Each status names the action it needs, with an icon and a tint in the same color. */
const STATUS: Record<ReceiptStatus, { label: string; icon: LucideIcon; tint: string }> = {
  pending: { label: 'Needs reading', icon: ScanText, tint: 'bg-soon-soft text-soon' },
  review: { label: 'Needs review', icon: ClipboardCheck, tint: 'bg-brand-soft text-brand-text' },
  confirmed: { label: 'Confirmed', icon: CircleCheck, tint: 'bg-ok-soft text-ok' },
}

function StatusPill({ status }: { status: ReceiptStatus }) {
  const { label, icon: Icon, tint } = STATUS[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs leading-none font-bold whitespace-nowrap',
        tint,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  )
}

function Thumb({ receipt, label }: { receipt: ReceiptView; label: string }) {
  const url = `/api/receipts/${receipt.id}/file`
  const tile =
    'grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-sm border border-line-strong bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
  return (
    <a href={url} target="_blank" rel="noopener" className={tile} aria-label={`Open ${label} in a new tab`}>
      {receipt.contentType === 'application/pdf' ? (
        <span className="grid justify-items-center gap-1 text-[10px] font-bold tracking-wide text-overdue">
          <FileText className="size-[18px] text-ink-3" aria-hidden />
          PDF
        </span>
      ) : (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      )}
    </a>
  )
}

type UploadedState = 'read' | 'unread'

const UPLOADED_MESSAGES: Record<UploadedState, string> = {
  read: 'Receipt uploaded and read.',
  unread: "Receipt uploaded, but it couldn't be read. Try again from the list.",
}

/** Retries reading a pending receipt; refreshes the list on success. */
function ReadButton({ id, label, onRead }: { id: number; label: string; onRead: () => void }) {
  const errorId = useId()
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function read() {
    setReading(true)
    setError(null)
    try {
      await apiRequest<ReceiptView>(`/api/receipts/${id}/read`, { method: 'POST' })
      onRead()
    } catch (err) {
      // Already read (another tab, or a read that finished after the client gave up).
      if (err instanceof ApiError && err.status === 409) {
        onRead()
        return
      }
      console.error(err)
      setError("Couldn't read this receipt. Try again.")
      setReading(false)
    }
  }

  return (
    <div className="grid justify-items-start sm:justify-items-end">
      <Button
        type="button"
        size="sm"
        onClick={() => void read()}
        disabled={reading}
        aria-label={`Read ${label}`}
        aria-describedby={error ? errorId : undefined}
      >
        <ScanText aria-hidden />
        {reading ? 'Reading...' : 'Read receipt'}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-overdue">
          {error}
        </p>
      )}
    </div>
  )
}

function ReceiptRow({ receipt, onChanged }: { receipt: ReceiptView; onChanged: () => void }) {
  const vehicleName = receipt.vehicle?.name ?? 'No vehicle'
  const date = formatDate(todayInEastern(new Date(receipt.uploadedAt)))
  const kind = receipt.contentType === 'application/pdf' ? 'PDF' : 'Photo'
  const label = `${kind.toLowerCase()} for ${vehicleName} uploaded ${date}`

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-4 border-b border-line py-5 last:border-b-0 sm:flex-nowrap sm:items-center sm:py-4">
      <Thumb receipt={receipt} label={label} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{vehicleName}</p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {kind} · Uploaded {date}
        </p>
        <div className="mt-2.5 sm:hidden">
          <StatusPill status={receipt.status} />
        </div>
      </div>
      <div className="hidden w-36 shrink-0 sm:block">
        <StatusPill status={receipt.status} />
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-start justify-start gap-2 pl-[60px] sm:w-[17rem] sm:flex-nowrap sm:justify-end sm:pl-0">
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/api/receipts/${receipt.id}/file`}
            target="_blank"
            rel="noopener"
            aria-label={`View ${label}`}
          >
            <ExternalLink aria-hidden />
            View
          </a>
        </Button>
        {receipt.status === 'pending' && (
          <ReadButton id={receipt.id} label={label} onRead={onChanged} />
        )}
        {receipt.status === 'review' && (
          <Link
            href={`/receipts/${receipt.id}/review`}
            className={buttonVariants({ size: 'sm' })}
            aria-label={`Review ${label}`}
          >
            <ClipboardCheck aria-hidden />
            Review
          </Link>
        )}
        {receipt.status === 'pending' && (
          <DeleteControl url={`/api/receipts/${receipt.id}`} label={label} onDeleted={onChanged} />
        )}
      </div>
    </li>
  )
}

function summary(receipts: ReceiptView[]): string {
  const toRead = receipts.filter((r) => r.status === 'pending').length
  const toReview = receipts.filter((r) => r.status === 'review').length
  const parts = [toReview ? `${toReview} to review` : null, toRead ? `${toRead} to read` : null].filter(Boolean)
  return parts.length ? `${parts.join(', ')}.` : 'All receipts confirmed.'
}

function ReceiptsContent({ data, onChange }: { data: ReceiptsResponse; onChange: () => void }) {
  const [uploaded, setUploaded] = useState<UploadedState | null>(() => {
    const state = (window.history.state as { uploaded?: unknown } | null)?.uploaded
    return state === 'read' || state === 'unread' ? state : null
  })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold sm:text-[32px]">Receipts</h1>
          {data.receipts.length > 0 && <p className="mt-0.5 text-sm text-ink-3">{summary(data.receipts)}</p>}
        </div>
        <Link href="/receipts/new" className={buttonVariants()}>
          <Receipt aria-hidden />
          Add receipt
        </Link>
      </div>
      <p role="status" className="mb-2 text-sm text-ok">
        {uploaded ? UPLOADED_MESSAGES[uploaded] : ''}
      </p>
      {data.receipts.length === 0 ? (
        <p className="text-ink-3">No receipts yet.</p>
      ) : (
        <ul className="rounded-lg border border-line bg-card px-5 shadow-card">
          {data.receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              onChanged={() => {
                setUploaded(null)
                onChange()
              }}
            />
          ))}
        </ul>
      )}
    </>
  )
}

export function ReceiptsPage() {
  return (
    <PageShell<ReceiptsResponse>
      url="/api/receipts"
      loadingText="Loading receipts..."
      errorText="Couldn't load receipts."
    >
      {(data, refresh) => <ReceiptsContent data={data} onChange={refresh} />}
    </PageShell>
  )
}
