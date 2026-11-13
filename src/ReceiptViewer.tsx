import { ExternalLink, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface ReceiptViewerProps {
  receiptId: number | null
  /** e.g. "Jun 14, 2026 · Toyota of Cary · $93.95" */
  caption: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Stored receipt image in a dialog; a bottom sheet on phone. */
export function ReceiptViewer({ receiptId, caption, open, onOpenChange }: ReceiptViewerProps) {
  const src = receiptId === null ? null : `/api/receipts/${receiptId}/file`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-line bg-surface p-0 shadow-drawer sm:max-w-[560px] max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[92svh] max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4 pr-12">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-text">
            <Receipt className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[17px] font-bold">Receipt</DialogTitle>
            <DialogDescription className="text-xs text-ink-3">{caption}</DialogDescription>
          </div>
        </div>
        <div className="grid place-items-center overflow-auto bg-bg-2 p-5">
          {src && (
            <img
              src={src}
              alt={`Receipt, ${caption}`}
              className="h-auto w-full max-w-[420px] rounded-sm shadow-card"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <span className="text-xs text-ink-3">Stored photo. Tap outside to close.</span>
          {src && (
            <Button variant="outline" size="sm" asChild>
              <a href={src} target="_blank" rel="noopener">
                <ExternalLink aria-hidden />
                Open original
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
