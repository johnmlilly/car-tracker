import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A field's error message; renders nothing without one. */
export function FieldError({ id, message }: { id?: string; message: ReactNode }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-overdue">
      {message}
    </p>
  )
}

/**
 * Native select styled like `Input`. Native keeps the iOS picker and plain
 * form semantics, which the Radix Select does not.
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full min-w-0 rounded-sm border border-line bg-surface-2 px-3 text-base text-ink outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

/** Sticky Cancel / Save row at the bottom of a drawer form. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-2 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:[&>button]:flex-1">
      {children}
    </div>
  )
}
