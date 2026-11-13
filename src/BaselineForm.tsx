import { Check } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ScheduleItemResponse, ScheduleItemView } from '../shared/api'
import { submitJson } from './api'
import { FieldError, FormActions } from './FormBits'

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
  const hasBaseline = item.baselineDate !== null || item.baselineOdometer !== null

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <p className="text-sm text-ink-3">
        When was this last done, before any service records in the app? Enter a date,
        mileage, or both.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-date`}>Date</Label>
        <Input
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
        />
        <FieldError id={dateErrorId} message={fieldErrors.baselineDate} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-odometer`}>Odometer (miles)</Label>
        <Input
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
        />
        <FieldError id={odometerErrorId} message={fieldErrors.baselineOdometer} />
      </div>
      <FieldError message={formError} />
      <FormActions>
        {hasBaseline && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void save(null, null)}
            disabled={saving}
            className="mr-auto text-overdue"
          >
            Clear
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          <Check aria-hidden />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </FormActions>
    </form>
  )
}
