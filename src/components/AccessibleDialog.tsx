import { useEffect, useRef, type ReactNode } from 'react'

interface AccessibleDialogProps {
  titleId: string
  onClose: () => void
  children: ReactNode
  className?: string
}

/** A small modal primitive with an initial focus target, keyboard trap, and focus restoration. */
export default function AccessibleDialog({ titleId, onClose, children, className = '' }: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog) return undefined
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('[data-dialog-autofocus], [autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
    const first = focusable()[0] ?? dialog
    first.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) { event.preventDefault(); dialog.focus(); return }
      const firstElement = elements[0]
      const lastElement = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) { event.preventDefault(); lastElement.focus() }
      else if (!event.shiftKey && document.activeElement === lastElement) { event.preventDefault(); firstElement.focus() }
    }
    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [])

  return <div className="dialog-backdrop" role="presentation"><section ref={dialogRef} className={`dialog-card ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>{children}</section></div>
}
