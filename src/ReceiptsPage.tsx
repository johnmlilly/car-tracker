import { useId, useState } from 'react'
import type { ReceiptStatus, ReceiptView, ReceiptsResponse } from '../shared/api'
import { todayInEastern } from '../shared/schedule'
import { ApiError, apiRequest } from './api'
import { ConfirmDelete } from './ConfirmDelete'
import { formatDate } from './format'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { buttonClass, errorTextClass, primaryButtonClass } from './styles'

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  pending: 'Waiting to be read',
  review: 'Ready to review',
  confirmed: 'Confirmed',
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
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void read()}
        disabled={reading}
        className={`${buttonClass} border border-zinc-300 dark:border-zinc-700`}
        aria-label={`Read ${label}`}
        aria-describedby={error ? errorId : undefined}
      >
        {reading ? 'Reading...' : 'Read receipt'}
      </button>
      {error && (
        <p id={errorId} role="alert" className={`mt-1 ${errorTextClass}`}>
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
    <ConfirmDelete
      url={receipt.status === 'pending' ? `/api/receipts/${receipt.id}` : undefined}
      label={label}
      onDeleted={onChanged}
    >
      <p className="font-medium">{vehicleName}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {kind} · Uploaded {date}
      </p>
      <p className="text-sm">{STATUS_LABELS[receipt.status]}</p>
      <a
        href={`/api/receipts/${receipt.id}/file`}
        target="_blank"
        rel="noopener"
        className="text-sm font-medium underline underline-offset-2"
        aria-label={`View ${kind.toLowerCase()} for ${vehicleName} uploaded ${date}`}
      >
        View
      </a>
      {receipt.status === 'pending' && (
        <ReadButton id={receipt.id} label={label} onRead={onChanged} />
      )}
      {receipt.status === 'review' && (
        <Link
          href={`/receipts/${receipt.id}/review`}
          className={`${primaryButtonClass} mt-2 inline-block`}
          aria-label={`Review ${label}`}
        >
          Review
        </Link>
      )}
    </ConfirmDelete>
  )
}

function ReceiptsContent({ data, onChange }: { data: ReceiptsResponse; onChange: () => void }) {
  const [uploaded, setUploaded] = useState<UploadedState | null>(() => {
    const state = (window.history.state as { uploaded?: unknown } | null)?.uploaded
    return state === 'read' || state === 'unread' ? state : null
  })

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <Link href="/receipts/new" className={primaryButtonClass}>
          Add receipt
        </Link>
      </div>
      <p role="status" className="mb-2 text-sm text-green-800 dark:text-green-300">
        {uploaded ? UPLOADED_MESSAGES[uploaded] : ''}
      </p>
      {data.receipts.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No receipts yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
