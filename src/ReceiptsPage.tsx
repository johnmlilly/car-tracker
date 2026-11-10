import { useState } from 'react'
import type { ReceiptStatus, ReceiptView, ReceiptsResponse } from '../shared/api'
import { todayInEastern } from '../shared/schedule'
import { ConfirmDelete } from './ConfirmDelete'
import { formatDate } from './format'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { primaryButtonClass } from './styles'

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  pending: 'Waiting for reading',
  review: 'Ready to review',
  confirmed: 'Confirmed',
}

function ReceiptRow({ receipt, onDeleted }: { receipt: ReceiptView; onDeleted: () => void }) {
  const vehicleName = receipt.vehicle?.name ?? 'No vehicle'
  const date = formatDate(todayInEastern(new Date(receipt.uploadedAt)))
  const kind = receipt.contentType === 'application/pdf' ? 'PDF' : 'Photo'

  return (
    <ConfirmDelete
      url={receipt.status === 'pending' ? `/api/receipts/${receipt.id}` : undefined}
      label={`${kind.toLowerCase()} for ${vehicleName} uploaded ${date}`}
      onDeleted={onDeleted}
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
    </ConfirmDelete>
  )
}

function ReceiptsContent({ data, onChange }: { data: ReceiptsResponse; onChange: () => void }) {
  const [uploaded, setUploaded] = useState(
    () => (window.history.state as { uploaded?: boolean } | null)?.uploaded === true,
  )

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <Link href="/receipts/new" className={primaryButtonClass}>
          Add receipt
        </Link>
      </div>
      <p role="status" className="mb-2 text-sm text-green-800 dark:text-green-300">
        {uploaded ? 'Receipt uploaded.' : ''}
      </p>
      {data.receipts.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No receipts yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              onDeleted={() => {
                setUploaded(false)
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
