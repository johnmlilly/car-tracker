import { useId, useRef, useState, type FormEvent } from 'react'
import type { ScheduleItemResponse, ScheduleItemView } from '../shared/api'
import { submitJson } from './api'
import { buttonClass, errorTextClass, inputClass, primaryButtonClass } from './styles'

type Fields = Partial<Record<'baselineDate' | 'baselineOdometer', string>>

interface BaselineFormProps {
  item: ScheduleItemView
  today: string
  onSaved: () => void
  onCancel: () => void
}

export function BaselineForm({ item, today, onSaved, onCancel }: BaselineFormProps) {
  const id = useId()
  const [date, setDate] = useState(item.baselineDate ?? '')
  const [odometer, setOdometer] = useState(item.baselineOdometer?.toString() ?? '')
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const odometerRef = useRef<HTMLInputElement>(null)

  async function save(baselineDate: string | null, baselineOdometer: number | null) {
    setSaving(true)
    setFormError(null)
    const result = await submitJson<ScheduleItemResponse>(
      `/api/schedule-items/${item.id}/baseline`,
      'PUT',
      { baselineDate, baselineOdometer },
    )
    if (result.ok) {
      onSaved()
      return
    }
    if ('fields' in result) setFieldErrors(result.fields)
    else setFormError(result.error)
    setSaving(false)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = odometer.trim()
    const errors: Fields = {}
    // Date and number inputs report '' for partial or unparseable entries (a
    // missing date segment, "61,000", "-"), so check badInput rather than
    // trusting an empty value to mean "blank".
    if (dateRef.current?.validity.badInput) errors.baselineDate = 'Enter a valid date.'
    const unparseable = odometerRef.current?.validity.badInput ?? false
    if (unparseable || (trimmed !== '' && !/^\d+$/.test(trimmed))) {
      errors.baselineOdometer = 'Enter whole miles.'
    }
    if (errors.baselineDate || errors.baselineOdometer) {
      setFieldErrors(errors)
      return
    }
    void save(date || null, trimmed === '' ? null : Number(trimmed))
  }

  const dateErrorId = `${id}-date-error`
  const odometerErrorId = `${id}-odometer-error`

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-3 grid gap-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        When was this last done? Enter a date, mileage, or both.
      </p>
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
            setFieldErrors((f) => ({ ...f, baselineDate: undefined }))
          }}
          aria-invalid={Boolean(fieldErrors.baselineDate)}
          aria-describedby={fieldErrors.baselineDate ? dateErrorId : undefined}
          className={inputClass}
        />
        {fieldErrors.baselineDate && (
          <p id={dateErrorId} role="alert" className={`mt-1 ${errorTextClass}`}>
            {fieldErrors.baselineDate}
          </p>
        )}
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
            setFieldErrors((f) => ({ ...f, baselineOdometer: undefined }))
          }}
          aria-invalid={Boolean(fieldErrors.baselineOdometer)}
          aria-describedby={fieldErrors.baselineOdometer ? odometerErrorId : undefined}
          className={inputClass}
        />
        {fieldErrors.baselineOdometer && (
          <p id={odometerErrorId} role="alert" className={`mt-1 ${errorTextClass}`}>
            {fieldErrors.baselineOdometer}
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className={errorTextClass}>
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className={primaryButtonClass}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`${buttonClass} border border-zinc-300 dark:border-zinc-700`}
        >
          Cancel
        </button>
        {(item.baselineDate !== null || item.baselineOdometer !== null) && (
          <button
            type="button"
            onClick={() => void save(null, null)}
            disabled={saving}
            className={`${buttonClass} ml-auto text-red-700 dark:text-red-300`}
          >
            Clear
          </button>
        )}
      </div>
    </form>
  )
}
