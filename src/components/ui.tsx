import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  full?: boolean
}

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-alt',
  ghost: 'text-ink-soft hover:bg-surface-alt hover:text-ink',
  danger: 'bg-rust text-white hover:brightness-110 shadow-sm',
}

export function Button({
  variant = 'primary', loading, full, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_STYLES[variant],
        full && 'w-full',
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

/** Même apparence que Button, mais rend un <Link> de React Router. */
export function LinkButton({
  to, variant = 'primary', full, className, children,
}: {
  to: string
  variant?: ButtonVariant
  full?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
        BUTTON_STYLES[variant],
        full && 'w-full',
        className,
      )}
    >
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
  )
}

export function PageTitle({ title, subtitle, action }: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */

type Tone = 'neutral' | 'accent' | 'leaf' | 'amber' | 'rust'

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-surface-alt text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  leaf: 'bg-leaf-soft text-leaf',
  amber: 'bg-amber-soft text-amber',
  rust: 'bg-rust-soft text-rust',
}

export function Badge({ tone = 'neutral', children, className }: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      TONE_STYLES[tone], className,
    )}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */

export function Field({ label, hint, children }: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

const CONTROL =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline-none'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'cursor-pointer', props.className)} />
}

/* ------------------------------------------------------------------ */

export function Alert({ tone = 'rust', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cx('rounded-xl px-4 py-3 text-sm', TONE_STYLES[tone])}
    >
      {children}
    </div>
  )
}

export function EmptyState({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-soft">{description}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-soft">
      <Spinner className="size-5" />
      {label}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-in relative max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="-m-1 rounded-lg p-1 text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
