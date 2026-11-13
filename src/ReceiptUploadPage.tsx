import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ReceiptView, VehiclesResponse } from '../shared/api'
import { ApiError, apiRequest } from './api'
import { PageShell } from './PageShell'
import { classifyFile, prepareReceipt, PrepareError } from './receiptFile'
import { navigate } from './route'
import { buttonClass, errorTextClass, primaryButtonClass } from './styles'

type Fields = Partial<Record<'vehicleId' | 'file', string>>
type Phase = 'idle' | 'preparing' | 'uploading' | 'reading'

const PHASE_LABELS: Record<Exclude<Phase, 'idle'>, string> = {
  preparing: 'Preparing photo...',
  uploading: 'Uploading...',
  reading: 'Reading receipt...',
}

const pickerClass = `${buttonClass} inline-flex cursor-pointer items-center justify-center border border-zinc-300 has-focus-visible:outline-2 dark:border-zinc-700`

/** Revokes the object URL when it is replaced or the form unmounts. */
function useRevokeOnChange(url: string | null) {
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])
}

async function uploadReceipt(vehicleId: string, blob: Blob): Promise<ReceiptView> {
  const form = new FormData()
  form.set('vehicleId', vehicleId)
  const name = { 'application/pdf': 'receipt.pdf', 'image/jpeg': 'receipt.jpg' }[blob.type] ?? 'receipt.webp'
  form.set('file', blob, name)
  return apiRequest<ReceiptView>('/api/receipts', { method: 'POST', body: form })
}

function ReceiptUploadForm({ vehicles }: { vehicles: VehiclesResponse['vehicles'] }) {
  const id = useId()
  const [vehicleId, setVehicleId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useRevokeOnChange(previewUrl)
  const busy = phase !== 'idle'

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const kind = classifyFile(chosen)
    setFormError(null)
    if ('error' in kind) {
      setFile(null)
      setPreviewUrl(null)
      setFieldErrors((f) => ({ ...f, file: kind.error }))
      return
    }
    setFile(chosen)
    setPreviewUrl(kind.kind === 'image' ? URL.createObjectURL(chosen) : null)
    setFieldErrors((f) => ({ ...f, file: undefined }))
  }

  async function upload(chosenVehicle: string, chosenFile: File) {
    setFormError(null)
    setPhase(chosenFile.type === 'application/pdf' ? 'uploading' : 'preparing')
    let receipt: ReceiptView
    try {
      const blob = await prepareReceipt(chosenFile)
      setPhase('uploading')
      receipt = await uploadReceipt(chosenVehicle, blob)
    } catch (err) {
      setPhase('idle')
      if (err instanceof PrepareError) {
        setFieldErrors({ file: err.message })
      } else if (err instanceof ApiError && err.status === 400 && err.fields) {
        setFieldErrors(err.fields)
      } else if (err instanceof ApiError && err.status === 413) {
        setFieldErrors({ file: err.message })
      } else {
        console.error(err)
        setFormError("Couldn't upload. Check your connection and try again.")
      }
      return
    }

    // The receipt is stored; a failed read leaves it pending with a retry on the list.
    setPhase('reading')
    try {
      await apiRequest<ReceiptView>(`/api/receipts/${receipt.id}/read`, { method: 'POST' })
      navigate('/receipts', { uploaded: 'read' })
    } catch (err) {
      console.error(err)
      navigate('/receipts', { uploaded: 'unread' })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Fields = {}
    if (vehicleId === '') errors.vehicleId = 'Choose a vehicle.'
    if (!file) errors.file = 'Choose a photo or PDF.'
    setFieldErrors(errors)
    if (errors.vehicleId || errors.file) return
    void upload(vehicleId, file!)
  }

  const vehicleErrorId = `${id}-vehicle-error`
  const fileErrorId = `${id}-file-error`
  const fileStatusId = `${id}-file-status`
  const fileDescribedBy = [fileStatusId, fieldErrors.file && fileErrorId].filter(Boolean).join(' ')

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6">
      <fieldset
        aria-invalid={Boolean(fieldErrors.vehicleId)}
        aria-describedby={fieldErrors.vehicleId ? vehicleErrorId : undefined}
      >
        <legend className="mb-2 text-sm font-medium">Vehicle</legend>
        <div className="grid gap-2">
          {vehicles.map((vehicle) => (
            <label
              key={vehicle.id}
              className="flex items-center gap-3 rounded-md border border-zinc-300 px-3 py-3 has-checked:border-zinc-900 dark:border-zinc-700 dark:has-checked:border-zinc-100"
            >
              <input
                type="radio"
                name={`${id}-vehicle`}
                value={vehicle.id}
                checked={vehicleId === String(vehicle.id)}
                onChange={(e) => {
                  setVehicleId(e.target.value)
                  setFieldErrors((f) => ({ ...f, vehicleId: undefined }))
                }}
                disabled={busy}
              />
              {vehicle.name}
            </label>
          ))}
        </div>
        {fieldErrors.vehicleId && (
          <p id={vehicleErrorId} role="alert" className={`mt-2 ${errorTextClass}`}>
            {fieldErrors.vehicleId}
          </p>
        )}
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-medium">Receipt</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={pickerClass}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={chooseFile}
              disabled={busy}
              aria-describedby={fileDescribedBy}
              className="sr-only"
            />
            Take photo
          </label>
          <label className={pickerClass}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={chooseFile}
              disabled={busy}
              aria-describedby={fileDescribedBy}
              className="sr-only"
            />
            Choose file
          </label>
        </div>
        <p id={fileStatusId} className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {file ? `Selected: ${file.name}` : 'No file selected.'}
        </p>
        {fieldErrors.file && (
          <p id={fileErrorId} role="alert" className={`mt-1 ${errorTextClass}`}>
            {fieldErrors.file}
          </p>
        )}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Selected receipt"
            className="mt-3 max-h-80 rounded-md border border-zinc-200 object-contain dark:border-zinc-800"
          />
        )}
        {file?.type === 'application/pdf' && (
          <p className="mt-3 rounded-md border border-zinc-200 px-3 py-6 text-center text-sm dark:border-zinc-800">
            PDF
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className={errorTextClass}>
          {formError}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full py-3`}>
          {phase === 'idle' ? 'Upload' : PHASE_LABELS[phase]}
        </button>
        {busy && (
          <p role="status" className="sr-only">
            {PHASE_LABELS[phase]}
          </p>
        )}
      </div>
    </form>
  )
}

export function ReceiptUploadPage() {
  return (
    <PageShell<VehiclesResponse>
      url="/api/vehicles"
      loadingText="Loading vehicles..."
      errorText="Couldn't load your vehicles."
    >
      {(data) => (
        <>
          <h1 className="mb-6 text-2xl font-semibold">Add receipt</h1>
          <ReceiptUploadForm vehicles={data.vehicles} />
        </>
      )}
    </PageShell>
  )
}
