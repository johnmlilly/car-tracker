import { Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { apiRequest } from './api'
import { FieldError } from './FormBits'

interface ConfirmDeleteProps {
  /** DELETE endpoint; omit for a row that can't be deleted here. */
  url?: string
  /** Names the row in button labels, e.g. "code B1 on Nov 7, 2026". */
  label: string
  onDeleted: () => void
  children: ReactNode
}

/** A list row with a two-step Delete -> Confirm delete / Cancel control. */
export function ConfirmDelete({ url, label, onDeleted, children }: ConfirmDeleteProps) {
  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{children}</div>
        {url !== undefined && <DeleteControl url={url} label={label} onDeleted={onDeleted} />}
      </div>
    </li>
  )
}

interface DeleteControlProps {
  url: string
  label: string
  onDeleted: () => void
  /** Shows "Delete" next to the icon. */
  showText?: boolean
}

/** Delete button that asks for confirmation, then sends DELETE to `url`. */
export function DeleteControl({ url, label, onDeleted, showText = false }: DeleteControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await apiRequest<void>(url, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      console.error(err)
      setError("Couldn't delete. Try again.")
      setDeleting(false)
    }
  }

  return (
    <div className="grid shrink-0 justify-items-end">
      {confirming ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void remove()}
            disabled={deleting}
            aria-label={`Confirm delete ${label}`}
          >
            {deleting ? 'Deleting...' : 'Confirm delete'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size={showText ? 'sm' : 'icon'}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${label}`}
        >
          <Trash2 aria-hidden />
          {showText && 'Delete'}
        </Button>
      )}
      <FieldError message={error} />
    </div>
  )
}
