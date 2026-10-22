/** Tillroll's mark: a till roll's receipt, torn at the bottom, its lines in the first three categories' colours. */
export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path
        className="brand-paper"
        d="M6 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v21l-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2-2.5 2-2.5-2-2.5 2z"
      />
      <path d="M10.5 10.5h11" stroke="var(--cat-1)" />
      <path d="M10.5 15h7" stroke="var(--cat-2)" />
      <path d="M10.5 19.5h9" stroke="var(--cat-3)" />
    </svg>
  );
}
