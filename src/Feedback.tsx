export function LoadingMessage({ children }: { children: string }) {
  return (
    <p className="text-zinc-500 dark:text-zinc-400" role="status">
      {children}
    </p>
  )
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 p-4 dark:border-red-800">
      <p className="mb-3">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Try again
      </button>
    </div>
  )
}
