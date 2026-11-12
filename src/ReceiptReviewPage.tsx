import { useId, useState } from 'react'
import type { ReceiptDetail } from '../shared/api'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { navigate } from './route'
import { ServiceForm, type ExtraFieldHelpers, type ServiceFormValues } from './ServiceForm'
import { errorTextClass, inputClass } from './styles'

const CHOOSE_CODE = 'Choose which Minder code was serviced.'

const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2))

function initialValues(extraction: NonNullable<ReceiptDetail['extraction']>): ServiceFormValues {
  return {
    date: extraction.date ?? '',
    odometer: extraction.odometer === null ? '' : String(extraction.odometer),
    shop: extraction.shop ?? '',
    total: dollars(extraction.totalCents),
    lines: extraction.lineItems.map((line) => ({
      serviceId: line.suggestedServiceId === null ? '' : String(line.suggestedServiceId),
      description: line.description,
      amount: dollars(line.amountCents),
    })),
  }
}

function ReceiptImage({ receipt }: { receipt: ReceiptDetail }) {
  const url = `/api/receipts/${receipt.id}/file`
  if (receipt.contentType === 'application/pdf') {
    return (
      <div className="grid gap-2">
        <iframe
          src={url}
          title="Receipt PDF"
          className="h-[70vh] w-full rounded-md border border-zinc-200 dark:border-zinc-800"
        />
        {/* Some browsers (iPhone Safari) show only the first page inline. */}
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="text-sm font-medium underline underline-offset-2"
        >
          Open PDF in a new tab
        </a>
      </div>
    )
  }
  return (
    <img
      src={url}
      alt="Receipt"
      className="w-full rounded-md border border-zinc-200 object-contain dark:border-zinc-800"
    />
  )
}

interface MinderFieldProps {
  code: string
  onCode: (code: string) => void
  receiptCode: string | null
  openCode: string | null
  helpers: ExtraFieldHelpers
}

/** Minder code on the receipt, with the mismatch choice when it differs from the open code. */
function MinderField({ code, onCode, receiptCode, openCode, helpers }: MinderFieldProps) {
  const id = useId()
  const { fieldErrors, errorId, clearError } = helpers
  const mismatch = receiptCode !== null && openCode !== null && receiptCode !== openCode
  const error = fieldErrors.minderCode
  const describedBy = error ? errorId('minderCode') : undefined

  return (
    <div className="grid gap-2">
      {mismatch && (
        <fieldset
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="rounded-md border border-amber-400 bg-amber-50 p-3 dark:border-amber-500 dark:bg-amber-950"
        >
          <legend className="px-1 text-sm font-medium">Minder code mismatch</legend>
          <p className="mb-2 text-sm">
            The receipt shows {receiptCode}, but the open logged code is {openCode}. Which code
            was serviced?
          </p>
          {[receiptCode, openCode].map((choice) => (
            <label key={choice} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="radio"
                name={`${id}-minder-choice`}
                value={choice}
                checked={code === choice}
                onChange={() => {
                  onCode(choice)
                  clearError('minderCode')
                }}
              />
              {choice}
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <label htmlFor={`${id}-minder`} className="text-sm font-medium">
          Minder code on receipt (optional)
        </label>
        <input
          id={`${id}-minder`}
          type="text"
          autoComplete="off"
          maxLength={20}
          value={code}
          onChange={(e) => {
            onCode(e.target.value)
            clearError('minderCode')
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      {error && (
        <p id={errorId('minderCode')} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  )
}

function ReviewContent({ receipt }: { receipt: ReceiptDetail }) {
  const extraction = receipt.extraction
  const receiptCode = extraction?.minderCode ?? null
  const openCode = receipt.openMinderCode
  const mismatch = receiptCode !== null && openCode !== null && receiptCode !== openCode
  // With a mismatch, the user must pick a code before confirming.
  const [minderCode, setMinderCode] = useState(mismatch ? '' : (receiptCode ?? ''))
  const isMinder = receipt.scheduleModel === 'minder'

  if (receipt.status !== 'review' || !extraction || !receipt.vehicle) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold">Review receipt</h1>
        <p className="mb-4">This receipt isn&apos;t ready to review.</p>
        <Link href="/receipts" className="text-sm font-medium underline underline-offset-2">
          Back to receipts
        </Link>
      </>
    )
  }
  const vehicle = receipt.vehicle

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Review receipt</h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">{vehicle.name}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <ReceiptImage receipt={receipt} />
        </div>
        <ServiceForm
          vehicleId={vehicle.id}
          today={receipt.today}
          services={receipt.services}
          initial={initialValues(extraction)}
          submitUrl={`/api/receipts/${receipt.id}/confirm`}
          submitLabel="Confirm service"
          resetOnSave={false}
          extraBody={{ minderCode: isMinder && minderCode.trim() !== '' ? minderCode.trim() : null }}
          validateExtra={() =>
            isMinder && mismatch && minderCode.trim() === '' ? { minderCode: CHOOSE_CODE } : {}
          }
          renderExtra={(helpers) =>
            isMinder && (
              <MinderField
                code={minderCode}
                onCode={setMinderCode}
                receiptCode={receiptCode}
                openCode={openCode}
                helpers={helpers}
              />
            )
          }
          conflictMessage={
            <>
              This receipt was already confirmed or isn&apos;t ready.{' '}
              <Link href="/receipts" className="underline underline-offset-2">
                Back to receipts
              </Link>
            </>
          }
          onSaved={() => navigate(`/vehicles/${vehicle.id}/services`)}
        />
      </div>
    </>
  )
}

export function ReceiptReviewPage({ id }: { id: number }) {
  return (
    <PageShell<ReceiptDetail>
      url={`/api/receipts/${id}`}
      loadingText="Loading receipt..."
      errorText="Couldn't load this receipt."
      notFoundTitle="Receipt not found"
      notFoundText="There's no receipt at this address."
    >
      {(data) => <ReviewContent receipt={data} />}
    </PageShell>
  )
}
