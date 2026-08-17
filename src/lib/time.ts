/**
 * Tout le métier Pacity est exprimé en heure de Paris (voir
 * assert_bookable_slot côté base). Le navigateur, lui, peut être dans
 * n'importe quel fuseau — et le sera forcément si l'app est démontrée
 * depuis une machine mal réglée ou déployée sur Vercel.
 *
 * Ces helpers convertissent dans les deux sens sans dépendance externe,
 * en s'appuyant sur Intl pour connaître l'offset réel à une date donnée
 * (donc en gérant l'heure d'été automatiquement).
 */

export const TZ = 'Europe/Paris'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

const ISO_DOW: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
}

export interface ParisParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 1 = lundi … 7 = dimanche */
  isoDow: number
}

/** Décompose un instant en heure murale de Paris. */
export function parisParts(d: Date): ParisParts {
  const map: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(d)) map[p.type] = p.value
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // 'en-US' + hour12:false rend parfois "24" pour minuit
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    isoDow: ISO_DOW[map.weekday] ?? 1,
  }
}

/** Décalage Paris↔UTC en millisecondes, à cet instant précis. */
function parisOffsetMs(d: Date): number {
  const p = parisParts(d)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - d.getTime() + (d.getTime() % 1000)
}

/**
 * Construit l'instant correspondant à une heure murale parisienne.
 * Deux passes : la première estime l'offset, la seconde le corrige si
 * l'estimation tombait de l'autre côté d'un changement d'heure.
 */
export function parisWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  let ts = wallAsUtc
  for (let i = 0; i < 2; i++) {
    ts = wallAsUtc - parisOffsetMs(new Date(ts))
  }
  return new Date(ts)
}

/** Ajoute des jours à une date « murale », sans dérive due au DST. */
function shiftCalendarDays(p: ParisParts, days: number) {
  const proxy = new Date(Date.UTC(p.year, p.month - 1, p.day))
  proxy.setUTCDate(proxy.getUTCDate() + days)
  return {
    year: proxy.getUTCFullYear(),
    month: proxy.getUTCMonth() + 1,
    day: proxy.getUTCDate(),
  }
}

/** Lundi 00h00 (heure de Paris) de la semaine contenant `d`. */
export function startOfParisWeek(d: Date): Date {
  const p = parisParts(d)
  const monday = shiftCalendarDays(p, -(p.isoDow - 1))
  return parisWallToUtc(monday.year, monday.month, monday.day, 0, 0)
}

/** Décale un début de semaine de N semaines. */
export function addWeeks(weekStart: Date, n: number): Date {
  const p = parisParts(weekStart)
  const shifted = shiftCalendarDays(p, n * 7)
  return parisWallToUtc(shifted.year, shifted.month, shifted.day, 0, 0)
}

/**
 * Instant d'un créneau de la grille.
 * @param dayIndex 0 = lundi … 4 = vendredi
 */
export function slotInstant(weekStart: Date, dayIndex: number, hour: number): Date {
  const p = parisParts(weekStart)
  const day = shiftCalendarDays(p, dayIndex)
  return parisWallToUtc(day.year, day.month, day.day, hour, 0)
}

/** Jour calendaire (lundi + dayIndex) de la semaine affichée. */
export function dayOfWeek(weekStart: Date, dayIndex: number): Date {
  return slotInstant(weekStart, dayIndex, 12) // midi : jamais ambigu au DST
}

export function isSameParisDay(a: Date, b: Date): boolean {
  const pa = parisParts(a)
  const pb = parisParts(b)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}

/* ------------------------------------------------------------------ */
/* Formatage                                                           */
/* ------------------------------------------------------------------ */

const fDayLong = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fDayShort = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short' })
const fDayNum = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' })
const fTime = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fDateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})
const fMonthYear = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, month: 'long', year: 'numeric' })

export const formatDayLong = (d: Date) => fDayLong.format(d)
export const formatDayShort = (d: Date) => fDayShort.format(d).replace('.', '')
export const formatDayNum = (d: Date) => fDayNum.format(d)
export const formatTime = (d: Date) => fTime.format(d)
export const formatDateTime = (d: Date) => fDateTime.format(d)
export const formatMonthYear = (d: Date) => fMonthYear.format(d)

/** « mardi 18 août, 14h00 → 16h00 » */
export function formatRange(start: Date, end: Date): string {
  return `${formatDayLong(start)}, ${formatTime(start)} → ${formatTime(end)}`
}
