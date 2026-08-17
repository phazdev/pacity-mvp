const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

export const formatPrice = (cents: number) => euros.format(cents / 100)

/** « 1 crédit », « 6 crédits », « 0 crédit » */
export function formatCredits(n: number): string {
  const abs = Math.abs(n)
  return `${n} ${abs > 1 ? 'crédits' : 'crédit'}`
}

/** Montant signé du ledger : « +20 », « −6 » (vrai signe moins typographique). */
export function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`
}

/** « 2,50 € / crédit » */
export function formatUnitPrice(cents: number, credits: number): string {
  return `${euros.format(cents / 100 / credits)} / crédit`
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}
