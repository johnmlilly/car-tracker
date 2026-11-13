import { Button } from '@/components/ui/button'

export function LoadingMessage({ children }: { children: string }) {
  return (
    <p className="text-ink-3" role="status">
      {children}
    </p>
  )
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-overdue/40 bg-overdue-soft p-4">
      <p className="mb-3">{message}</p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
