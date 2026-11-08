import { useId, useRef, useState, type FormEvent } from 'react'
import type { OdometerResponse } from '../shared/api'
import { submitJson } from './api'
import { errorTextClass, inputClass, primaryButtonClass } from './styles'

type Fields = Partial<Record<'date' | 'odometer', string>>

interface OdometerFormProps {
  vehicleId: number
  today: string
  onSaved: () => void
}

export function OdometerForm({ vehicleId, today, onSaved }: OdometerFormProps) {
  const id = useId()
  const [date, setDate] = useState(today)
  const [odometer, setOdometer] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const odometerRef = useRef<HTMLInputElement>(null)

  async function save(reading: { date: string; odometer: number }) {
    setSaving(true)
    setFormError(null)
    const result = await submitJson<OdometerResponse>(
      `/api/vehicles/${vehicleId}/odometer`,
      'POST',
      reading,
    )
    setSaving(false)
    if (result.ok) {
      setOdometer('')
      onSaved()
    } else if ('fields' in result) {
      setFieldErrors(result.fields)
    } else {
      setFormError(result.error)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Fields = {}
    // Date and number inputs report '' for partial or unparseable entries, so
    // badInput is the only way to tell those apart from a blank field.
    if (date === '' || dateRef.current?.validity.badInput) errors.date = 'Enter a valid date.'
    const trimmed = odometer.trim()
    if (odometerRef.current?.validity.badInput || !/^\d+$/.test(trimmed)) {
      errors.odometer = 'Enter whole miles.'
    }
    setFieldErrors(errors)
    if (errors.date || errors.odometer) return
    void save({ date, odometer: Number(trimmed) })
  }

  const dateErrorId = `${id}-date-error`
  const odometerErrorId = `${id}-odometer-error`

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-date`} className="text-sm font-medium">
            Date
          </label>
          <input
            id={`${id}-date`}
            ref={dateRef}
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setFieldErrors((f) => ({ ...f, date: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.date)}
            aria-describedby={fieldErrors.date ? dateErrorId : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-odometer`} className="text-sm font-medium">
            Odometer (miles)
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
      {fieldErrors.date && (
        <p id={dateErrorId} role="alert" className={errorTextClass}>
          {fieldErrors.date}
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
          {saving ? 'Saving...' : 'Log reading'}
        </button>
      </div>
    </form>
  )
}
