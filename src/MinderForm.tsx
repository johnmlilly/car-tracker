import { useId, useRef, useState, type FormEvent } from 'react'
import type { MinderResponse } from '../shared/api'
import { ApiError, apiRequest } from './api'
import { errorTextClass, inputClass, primaryButtonClass } from './styles'

type Fields = Partial<Record<'code' | 'odometer', string>>

export function MinderForm({ vehicleId, onSaved }: { vehicleId: number; onSaved: () => void }) {
  const id = useId()
  const [code, setCode] = useState('')
  const [odometer, setOdometer] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const odometerRef = useRef<HTMLInputElement>(null)

  async function save(body: { code: string; odometer: number | null }) {
    setSaving(true)
    setFormError(null)
    try {
      await apiRequest<MinderResponse>(`/api/vehicles/${vehicleId}/minder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setCode('')
      setOdometer('')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields) {
        setFieldErrors(err.fields)
      } else {
        console.error(err)
        setFormError("Couldn't save. Try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Fields = {}
    if (code.trim() === '') errors.code = 'Enter a code like A or B12.'
    const trimmed = odometer.trim()
    // A number input reports '' for unparseable text, so badInput catches it.
    if (odometerRef.current?.validity.badInput || (trimmed !== '' && !/^\d+$/.test(trimmed))) {
      errors.odometer = 'Enter whole miles.'
    }
    setFieldErrors(errors)
    if (errors.code || errors.odometer) return
    void save({ code, odometer: trimmed === '' ? null : Number(trimmed) })
  }

  const codeErrorId = `${id}-code-error`
  const codeHelpId = `${id}-code-help`
  const odometerErrorId = `${id}-odometer-error`

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-code`} className="text-sm font-medium">
            Minder code
          </label>
          <input
            id={`${id}-code`}
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setFieldErrors((f) => ({ ...f, code: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.code)}
            aria-describedby={fieldErrors.code ? `${codeHelpId} ${codeErrorId}` : codeHelpId}
            className={inputClass}
          />
          <p id={codeHelpId} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            As shown on the dash, e.g. B12
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-odometer`} className="text-sm font-medium">
            Odometer (optional)
          </label>
          <input
            id={`${id}-odometer`}
            ref={odometerRef}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={odometer}
            onChange={(e) => {
              setOdometer(e.target.value)
              setFieldErrors((f) => ({ ...f, odometer: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.odometer)}
            aria-describedby={fieldErrors.odometer ? odometerErrorId : undefined}
            className={inputClass}
          />
        </div>
      </div>
      {fieldErrors.code && (
        <p id={codeErrorId} role="alert" className={errorTextClass}>
          {fieldErrors.code}
        </p>
      )}
      {fieldErrors.odometer && (
        <p id={odometerErrorId} role="alert" className={errorTextClass}>
          {fieldErrors.odometer}
        </p>
      )}
      {formError && (
        <p role="alert" className={errorTextClass}>
          {formError}
        </p>
      )}
      <div>
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Saving...' : 'Log code'}
        </button>
      </div>
    </form>
  )
}
