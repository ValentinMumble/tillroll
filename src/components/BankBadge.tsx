/** The banks with a logo in public/banks (their site icons); any other shows its first letter. */
const LOGOS: Record<string, string> = {
  Revolut: '/banks/revolut.png',
  'Crédit Coopératif': '/banks/credit-cooperatif.png',
  PayPal: '/banks/paypal.png',
}

/** The bank a payment comes from, as a small logo before its name (the name on hover). No bank is Revolut. */
export function BankBadge({ bank = 'Revolut' }: { bank?: string }) {
  const logo = LOGOS[bank]
  return logo ? (
    <img className="bank-badge" src={logo} alt={bank} title={bank} width={18} height={18} />
  ) : (
    <span className="bank-badge" role="img" aria-label={bank} title={bank}>
      {bank.charAt(0).toUpperCase()}
    </span>
  )
}
