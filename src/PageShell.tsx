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
  children: (data: T, refresh: () => void) => ReactNode
}

/** Back link plus loading, error, and not-found states around a `useApi` load. */
export function PageShell<T>({
  url,
  loadingText,
  errorText,
  notFoundTitle = 'Vehicle not found',
  notFoundText = "There's no vehicle at this address.",
  children,
}: PageShellProps<T>) {
  const { state, retry, refresh } = useApi<T>(url)

  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← All vehicles
      </Link>
      {state.status === 'loading' && <LoadingMessage>{loadingText}</LoadingMessage>}
      {state.status === 'error' && <ErrorPanel message={errorText} onRetry={retry} />}
      {state.status === 'notFound' && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">{notFoundTitle}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{notFoundText}</p>
        </>
      )}
      {state.status === 'ready' && children(state.data, refresh)}
    </>
  )
}
