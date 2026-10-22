/** Tillroll's mark: three spending bars, in the first three categories' colours. */
export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 8h22" stroke="var(--cat-1)" />
      <path d="M5 16h14" stroke="var(--cat-2)" />
      <path d="M5 24h18" stroke="var(--cat-3)" />
    </svg>
  );
}
