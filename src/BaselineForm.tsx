import { useId, useRef, useState, type FormEvent } from 'react'
import type { ScheduleItemResponse, ScheduleItemView } from '../shared/api'
import { ApiError, apiRequest } from './api'

type Fields = Partial<Record<'baselineDate' | 'baselineOdometer', string>>

interface BaselineFormProps {
  item: ScheduleItemView
  today: string
  onSaved: () => void
  onCancel: () => void
}

const inputClass =
  'mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900'
const buttonClass = 'rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50'

export function BaselineForm({ item, today, onSaved, onCancel }: BaselineFormProps) {
  const id = useId()
  const [date, setDate] = useState(item.baselineDate ?? '')
  const [odometer, setOdometer] = useState(item.baselineOdometer?.toString() ?? '')
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const odometerRef = useRef<HTMLInputElement>(null)

  async function save(baselineDate: string | null, baselineOdometer: number | null) {
    setSaving(true)
    setFormError(null)
    try {
      await apiRequest<ScheduleItemResponse>(`/api/schedule-items/${item.id}/baseline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineDate, baselineOdometer }),
      })
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields) {
        setFieldErrors(err.fields)
      } else {
        console.error(err)
        setFormError("Couldn't save. Try again.")
      }
      setSaving(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = odometer.trim()
    // A number input reports '' for text it can't parse (e.g. "61,000" or "-"),
    // so check badInput rather than trusting an empty value to mean "blank".
    const unparseable = odometerRef.current?.validity.badInput ?? false
    if (unparseable || (trimmed !== '' && !/^\d+$/.test(trimmed))) {
      setFieldErrors({ baselineOdometer: 'Enter whole miles.' })
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
          <p id={dateErrorId} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">
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
          <p
            id={odometerErrorId}
            role="alert"
            className="mt-1 text-sm text-red-700 dark:text-red-300"
          >
            {fieldErrors.baselineOdometer}
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`${buttonClass} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}
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
