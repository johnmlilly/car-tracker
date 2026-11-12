import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ServiceRecordInput } from '../shared/api'
import { parseDollarsToCents } from '../shared/money'
import { submitJson } from './api'
import { buttonClass, errorTextClass, inputClass, primaryButtonClass } from './styles'

interface Line {
  key: number
  /** '' means "Other (not tracked)". */
  serviceId: string
  description: string
  amount: string
}

export type Fields = Record<string, string | undefined>

/** Starting values for the form, as the user would type them. */
export interface ServiceFormValues {
  date: string
  odometer: string
  shop: string
  total: string
  lines: { serviceId: string; description: string; amount: string }[]
}

export interface ExtraFieldHelpers {
  fieldErrors: Fields
  /** Element id for a field's error message (use it for the message and aria-describedby). */
  errorId: (key: string) => string
  /** Call when the user edits an extra field, to clear its error. */
  clearError: (key: string) => void
}

interface ServiceFormProps {
  vehicleId: number
  today: string
  services: { id: number; name: string }[]
  onSaved: () => void
  /** Prefill; the manual entry form starts blank. */
  initial?: ServiceFormValues
  /** POST target; defaults to the vehicle's service-records endpoint. */
  submitUrl?: string
  submitLabel?: string
  /** Merged into the request body. */
  extraBody?: Record<string, unknown>
  /** Extra checks before submit; returns field messages keyed like server fields. */
  validateExtra?: () => Fields
  /** Extra fields rendered after the line items. */
  renderExtra?: (helpers: ExtraFieldHelpers) => ReactNode
  /** Shown in place of the generic error when the server answers 409. */
  conflictMessage?: ReactNode
  /** Clear the form and show "Service saved." after saving (manual entry). */
  resetOnSave?: boolean
}

const AMOUNT_MESSAGE = 'Enter dollars and cents, like 49.99.'

let nextKey = 1
const newLine = (): Line => ({ key: nextKey++, serviceId: '', description: '', amount: '' })

function ErrorText({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className={`mt-1 ${errorTextClass}`}>
      {message}
    </p>
  )
}

export function ServiceForm({
  vehicleId,
  today,
  services,
  onSaved,
  initial,
  submitUrl = `/api/vehicles/${vehicleId}/service-records`,
  submitLabel = 'Save service',
  extraBody,
  validateExtra,
  renderExtra,
  conflictMessage,
  resetOnSave = true,
}: ServiceFormProps) {
  const id = useId()
  const [date, setDate] = useState(initial?.date ?? today)
  const [odometer, setOdometer] = useState(initial?.odometer ?? '')
  const [shop, setShop] = useState(initial?.shop ?? '')
  const [total, setTotal] = useState(initial?.total ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    initial && initial.lines.length > 0
      ? initial.lines.map((line) => ({ ...newLine(), ...line }))
      : [newLine()],
  )
  const [fieldErrors, setFieldErrors] = useState<Fields>({})
  const [formError, setFormError] = useState<ReactNode>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const odometerRef = useRef<HTMLInputElement>(null)
  const selectRefs = useRef(new Map<number, HTMLSelectElement>())
  // A line added by "Add line" takes focus when its select mounts.
  const focusOnMount = useRef<number | null>(null)

  const serviceName = (serviceId: string) =>
    services.find((s) => String(s.id) === serviceId)?.name ?? ''

  function edited(...keys: string[]) {
    setSaved(false)
    setFieldErrors((f) => {
      const next = { ...f }
      for (const key of keys) delete next[key]
      return next
    })
  }

  function updateLine(index: number, patch: Partial<Line>, ...keys: string[]) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
    edited(...keys.map((k) => `items.${index}.${k}`))
  }

  function pickService(index: number, serviceId: string) {
    const line = lines[index]
    const previous = serviceName(line.serviceId)
    // Fill an empty description, or one that still matches the previous pick.
    const fill = line.description.trim() === '' || line.description === previous
    updateLine(
      index,
      { serviceId, description: fill ? serviceName(serviceId) : line.description },
      'serviceId',
      'description',
    )
  }

  function addLine() {
    const line = newLine()
    focusOnMount.current = line.key
    setLines((current) => [...current, line])
    setSaved(false)
  }

  function removeLine(index: number) {
    // Focus the previous line, or the next one when removing the first.
    const target = index > 0 ? lines[index - 1] : lines[1]
    setLines((current) => current.filter((_, i) => i !== index))
    // Line errors are keyed by position, so they no longer line up.
    setFieldErrors((f) =>
      Object.fromEntries(Object.entries(f).filter(([key]) => !key.startsWith('items.'))),
    )
    selectRefs.current.get(target.key)?.focus()
    setSaved(false)
  }

  async function save(body: ServiceRecordInput) {
    setSaving(true)
    setFormError(null)
    const result = await submitJson<unknown>(submitUrl, 'POST', { ...body, ...extraBody })
    setSaving(false)
    if (result.ok) {
      if (resetOnSave) {
        setDate(today)
        setOdometer('')
        setShop('')
        setTotal('')
        setLines([newLine()])
        setSaved(true)
      }
      onSaved()
    } else if ('fields' in result) {
      setFieldErrors(result.fields)
    } else {
      setFormError(result.status === 409 && conflictMessage ? conflictMessage : result.error)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    const errors: Fields = {}
    // Date and number inputs report '' for partial or unparseable entries, so
    // badInput is the only way to tell those apart from a blank field.
    if (date === '' || dateRef.current?.validity.badInput) errors.date = 'Enter a valid date.'
    const miles = odometer.trim()
    if (odometerRef.current?.validity.badInput || (miles !== '' && !/^\d+$/.test(miles))) {
      errors.odometer = 'Enter whole miles.'
    }
    const totalCents = total.trim() === '' ? null : parseDollarsToCents(total)
    if (totalCents === null && total.trim() !== '') errors.totalCents = AMOUNT_MESSAGE

    const items = lines.map((line, index) => {
      const description = line.description.trim() || serviceName(line.serviceId)
      if (description === '') {
        errors[`items.${index}.description`] = 'Pick a service or enter a description.'
      }
      const amountCents = line.amount.trim() === '' ? null : parseDollarsToCents(line.amount)
      if (amountCents === null && line.amount.trim() !== '') {
        errors[`items.${index}.amountCents`] = AMOUNT_MESSAGE
      }
      return {
        description,
        serviceId: line.serviceId === '' ? null : Number(line.serviceId),
        amountCents,
      }
    })

    Object.assign(errors, validateExtra?.())
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return
    void save({
      date,
      odometer: miles === '' ? null : Number(miles),
      shop: shop.trim() || null,
      totalCents,
      items,
    })
  }

  const errorId = (key: string) => `${id}-${key.replace(/\./g, '-')}-error`
  const describe = (key: string) => (fieldErrors[key] ? errorId(key) : undefined)

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
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
              edited('date')
            }}
            aria-invalid={Boolean(fieldErrors.date)}
            aria-describedby={describe('date')}
            className={inputClass}
          />
          <ErrorText id={errorId('date')} message={fieldErrors.date} />
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
              edited('odometer')
            }}
            aria-invalid={Boolean(fieldErrors.odometer)}
            aria-describedby={describe('odometer')}
            className={inputClass}
          />
          <ErrorText id={errorId('odometer')} message={fieldErrors.odometer} />
        </div>
        <div>
          <label htmlFor={`${id}-shop`} className="text-sm font-medium">
            Shop (optional)
          </label>
          <input
            id={`${id}-shop`}
            type="text"
            maxLength={100}
            autoComplete="off"
            value={shop}
            onChange={(e) => {
              setShop(e.target.value)
              edited('shop')
            }}
            aria-invalid={Boolean(fieldErrors.shop)}
            aria-describedby={describe('shop')}
            className={inputClass}
          />
          <ErrorText id={errorId('shop')} message={fieldErrors.shop} />
        </div>
        <div>
          <label htmlFor={`${id}-total`} className="text-sm font-medium">
            Total $ (optional)
          </label>
          <input
            id={`${id}-total`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={total}
            onChange={(e) => {
              setTotal(e.target.value)
              edited('totalCents')
            }}
            aria-invalid={Boolean(fieldErrors.totalCents)}
            aria-describedby={describe('totalCents')}
            className={inputClass}
          />
          <ErrorText id={errorId('totalCents')} message={fieldErrors.totalCents} />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Line items</legend>
        {lines.map((line, index) => {
          const n = index + 1
          const key = (name: string) => `items.${index}.${name}`
          return (
            <div
              key={line.key}
              className="grid gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div>
                <label htmlFor={`${id}-${line.key}-service`} className="text-sm font-medium">
                  Service <span className="sr-only">for line {n}</span>
                </label>
                <select
                  id={`${id}-${line.key}-service`}
                  ref={(el) => {
                    if (!el) {
                      selectRefs.current.delete(line.key)
                      return
                    }
                    selectRefs.current.set(line.key, el)
                    if (focusOnMount.current === line.key) {
                      focusOnMount.current = null
                      el.focus()
                    }
                  }}
                  value={line.serviceId}
                  onChange={(e) => pickService(index, e.target.value)}
                  aria-invalid={Boolean(fieldErrors[key('serviceId')])}
                  aria-describedby={describe(key('serviceId'))}
                  className={inputClass}
                >
                  <option value="">Other (not tracked)</option>
                  {services.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ErrorText id={errorId(key('serviceId'))} message={fieldErrors[key('serviceId')]} />
              </div>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div>
                  <label htmlFor={`${id}-${line.key}-description`} className="text-sm font-medium">
                    Description <span className="sr-only">for line {n}</span>
                  </label>
                  <input
                    id={`${id}-${line.key}-description`}
                    type="text"
                    maxLength={200}
                    autoComplete="off"
                    value={line.description}
                    onChange={(e) => updateLine(index, { description: e.target.value }, 'description')}
                    aria-invalid={Boolean(fieldErrors[key('description')])}
                    aria-describedby={describe(key('description'))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-${line.key}-amount`} className="text-sm font-medium">
                    Amount $ <span className="sr-only">for line {n}</span>
                  </label>
                  <input
                    id={`${id}-${line.key}-amount`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.amount}
                    onChange={(e) => updateLine(index, { amount: e.target.value }, 'amountCents')}
                    aria-invalid={Boolean(fieldErrors[key('amountCents')])}
                    aria-describedby={describe(key('amountCents'))}
                    className={inputClass}
                  />
                </div>
              </div>
              <ErrorText
                id={errorId(key('description'))}
                message={fieldErrors[key('description')]}
              />
              <ErrorText
                id={errorId(key('amountCents'))}
                message={fieldErrors[key('amountCents')]}
              />
              {lines.length > 1 && (
                <div>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-sm font-medium text-red-700 underline underline-offset-2 dark:text-red-300"
                  >
                    Remove <span className="sr-only">line {n}</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <ErrorText id={errorId('items')} message={fieldErrors.items} />
        <div>
          <button
            type="button"
            onClick={addLine}
            className={`${buttonClass} border border-zinc-300 dark:border-zinc-700`}
          >
            Add line
          </button>
        </div>
      </fieldset>

      {renderExtra?.({ fieldErrors, errorId, clearError: (key) => edited(key) })}

      {formError && (
        <p role="alert" className={errorTextClass}>
          {formError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Saving...' : submitLabel}
        </button>
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {saved ? 'Service saved.' : ''}
        </p>
      </div>
    </form>
  )
}
