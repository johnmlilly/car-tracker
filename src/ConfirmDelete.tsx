import { useState, type ReactNode } from 'react'
import { apiRequest } from './api'
import { buttonClass, errorTextClass } from './styles'

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
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(deleteUrl: string) {
    setDeleting(true)
    setError(null)
    try {
      await apiRequest<void>(deleteUrl, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      console.error(err)
      setError("Couldn't delete. Try again.")
      setDeleting(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>
        {url !== undefined &&
          (confirming ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void remove(url)}
                disabled={deleting}
                className={`${buttonClass} bg-red-700 text-white dark:bg-red-400 dark:text-zinc-950`}
                aria-label={`Confirm delete ${label}`}
              >
                {deleting ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className={`${buttonClass} border border-zinc-300 dark:border-zinc-700`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="shrink-0 text-sm font-medium text-red-700 underline underline-offset-2 dark:text-red-300"
              aria-label={`Delete ${label}`}
            >
              Delete
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className={`mt-1 ${errorTextClass}`}>
          {error}
        </p>
      )}
    </li>
  )
}
