import { Check } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MinderResponse } from '../shared/api'
import { submitJson } from './api'
import { FieldError, FormActions } from './FormBits'

type Fields = Partial<Record<'code' | 'odometer', string>>

interface MinderFormProps {
  vehicleId: number
  onSaved: () => void
  onCancel: () => void
  /** Shown between the fields and the actions, e.g. recent codes. */
  children?: ReactNode
}

export function MinderForm({ vehicleId, onSaved, onCancel, children }: MinderFormProps) {
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
    const result = await submitJson<MinderResponse>(
      `/api/vehicles/${vehicleId}/minder`,
      'POST',
      body,
    )
    setSaving(false)
    if (result.ok) {
      setCode('')
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
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-code`}>Minder code</Label>
          <Input
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
          />
          <p id={codeHelpId} className="text-xs text-ink-3">
            As shown on the dash, e.g. B12
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-odometer`}>Odometer (optional)</Label>
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
      </div>
      <FieldError id={codeErrorId} message={fieldErrors.code} />
      <FieldError id={odometerErrorId} message={fieldErrors.odometer} />
      <FieldError message={formError} />
      {children}
      <FormActions>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          <Check aria-hidden />
          {saving ? 'Saving...' : 'Log code'}
        </Button>
      </FormActions>
    </form>
  )
}
