import { money } from '../format'

interface Props {
  value: number
  currency: string
  /** Leaves out the "more" and "less" words. */
  compact?: boolean
}

/** A spending change: up is shown as bad, down as good, always with an arrow so color is never the only sign. */
export function Delta({ value, currency, compact = false }: Props) {
  if (Math.abs(value) < 1) return <span className="delta is-flat">{compact ? '=' : 'the same'}</span>
  const up = value > 0
  return (
    <span className={`delta ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {money(Math.abs(value), currency)}
      {compact ? '' : up ? ' more' : ' less'}
    </span>
  )
}
