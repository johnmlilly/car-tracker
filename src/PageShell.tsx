import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApi } from './api'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { Link } from './Link'

interface PageShellProps<T> {
  url: string
  loadingText: string
  errorText: string
  notFoundTitle?: string
  notFoundText?: string
  backHref?: string
  backLabel?: string
  children: (data: T, refresh: () => void) => ReactNode
}

/** Back link plus loading, error, and not-found states around a `useApi` load. */
export function PageShell<T>({
  url,
  loadingText,
  errorText,
  notFoundTitle = 'Vehicle not found',
  notFoundText = "There's no vehicle at this address.",
  backHref = '/',
  backLabel = 'Garage',
  children,
}: PageShellProps<T>) {
  const { state, retry, refresh } = useApi<T>(url)

  return (
    <>
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      {state.status === 'loading' && <LoadingMessage>{loadingText}</LoadingMessage>}
      {state.status === 'error' && <ErrorPanel message={errorText} onRetry={retry} />}
      {state.status === 'notFound' && (
        <>
          <h1 className="mb-2 text-2xl font-bold">{notFoundTitle}</h1>
          <p className="text-ink-3">{notFoundText}</p>
        </>
      )}
      {state.status === 'ready' && children(state.data, refresh)}
    </>
  )
}
