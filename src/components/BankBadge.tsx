/** Banks known by their initial and colour; any other shows its first letter. */
const BANKS: Record<string, { letter: string; tone: string }> = {
  Revolut: { letter: 'R', tone: 'revolut' },
  'Crédit Coopératif': { letter: 'C', tone: 'credit-cooperatif' },
  PayPal: { letter: 'P', tone: 'paypal' },
}

/** The bank a payment comes from, as a coloured letter before its name (the name on hover). No bank is Revolut. */
export function BankBadge({ bank = 'Revolut' }: { bank?: string }) {
  const known = BANKS[bank]
  return (
    <span className={`bank-badge${known ? ` is-${known.tone}` : ''}`} role="img" aria-label={bank} title={bank}>
      {known?.letter ?? bank.charAt(0).toUpperCase()}
    </span>
  )
}
