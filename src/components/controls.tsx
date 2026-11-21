import type { ComponentProps } from 'react'

export interface ButtonProps extends ComponentProps<'button'> {
  /** Disables the button and exposes a busy state while an async action runs. */
  loading?: boolean
}

/**
 * Native button used across the app. Visual variants come from the `button*`
 * CSS classes. `loading` disables the control, sets `aria-busy` and shows a
 * spinner without changing the accessible name.
 */
export function Button({ loading = false, disabled, type = 'button', className, children, ...props }: ButtonProps) {
  return <button {...props} type={type} className={className} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined}>
    {children}
    {loading && <span className="button-spinner" aria-hidden="true" />}
  </button>
}

/** Icon-only button; callers must pass `aria-label`. */
export const IconButton = Button

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} />
}
