import { cx } from '@/components/ui'

/**
 * Photo d'une salle.
 *
 * `image_url` peut être NULL (salle créée sans photo) : on affiche alors un
 * aplat neutre plutôt qu'une image cassée. Les sources ont des formats très
 * différents (500×496 carré pour la Medium, 1200×1500 portrait pour le Phone
 * Booth) — d'où le ratio imposé + object-cover, qui recadre proprement au
 * lieu de déformer.
 */
export function RoomPhoto({
  src, alt, className, ratio = 'aspect-[16/10]',
}: {
  src: string | null
  alt: string
  className?: string
  ratio?: string
}) {
  if (!src) {
    return (
      <div className={cx(ratio, 'grid w-full place-items-center bg-surface-alt', className)}>
        <svg viewBox="0 0 24 24" className="size-8 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 16l-5-5-4.5 4.5L9 13l-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cx(ratio, 'w-full bg-surface-alt object-cover', className)}
    />
  )
}
