import { type Grain, periodLabel } from '../periods'

interface Props {
  grain: Grain
  onGrain: (grain: Grain) => void
  period: string
  onStep: (steps: number) => void
  canGoBack: boolean
  canGoForward: boolean
  currencies: string[]
  currency: string
  onCurrency: (currency: string) => void
}

const GRAINS: [Grain, string][] = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['all', 'All time'],
]

/** The one row of controls: the length of the period, which one, and the currency when there are several. */
export function Toolbar(props: Props) {
  const { grain, onGrain, period, onStep, canGoBack, canGoForward, currencies, currency, onCurrency } = props
  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Period">
        {GRAINS.map(([item, label]) => (
          <button key={item} type="button" aria-pressed={grain === item} onClick={() => onGrain(item)}>
            {label}
          </button>
        ))}
      </div>
      {grain !== 'all' && (
        <div className="stepper">
          <button type="button" aria-label={`Previous ${grain}`} disabled={!canGoBack} onClick={() => onStep(-1)}>
            ‹
          </button>
          <span className="stepper-label" aria-live="polite">
            {periodLabel(period, grain)}
          </span>
          <button type="button" aria-label={`Next ${grain}`} disabled={!canGoForward} onClick={() => onStep(1)}>
            ›
          </button>
        </div>
      )}
      {currencies.length > 1 && (
        <select
          className="select"
          aria-label="Currency"
          value={currency}
          onChange={(event) => onCurrency(event.target.value)}
        >
          {currencies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
