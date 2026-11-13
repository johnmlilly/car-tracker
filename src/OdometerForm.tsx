import { Check } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OdometerResponse } from '../shared/api'
import { submitJson } from './api'
import { FieldError, FormActions } from './FormBits'

type Fields = Partial<Record<'date' | 'odometer', string>>

interface OdometerFormProps {
  vehicleId: number
  today: string
  onSaved: () => void
  onCancel: () => void
  /** Shown between the fields and the actions, e.g. recent readings. */
  children?: ReactNode
}

export function OdometerForm({
  vehicleId,
  today,
  onSaved,
  onCancel,
  children,
}: OdometerFormProps) {
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
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-odometer`}>Reading (miles)</Label>
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
              setFieldErrors((f) => ({ ...f, odometer: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.odometer)}
            aria-describedby={fieldErrors.odometer ? odometerErrorId : undefined}
          />
        </div>
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
              setFieldErrors((f) => ({ ...f, date: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.date)}
            aria-describedby={fieldErrors.date ? dateErrorId : undefined}
          />
        </div>
      </div>
      <FieldError id={odometerErrorId} message={fieldErrors.odometer} />
      <FieldError id={dateErrorId} message={fieldErrors.date} />
      <FieldError message={formError} />
      {children}
      <FormActions>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          <Check aria-hidden />
          {saving ? 'Saving...' : 'Save reading'}
        </Button>
      </FormActions>
    </form>
  )
}
