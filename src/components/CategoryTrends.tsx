import type {Categories} from '../categories';
import {money} from '../format';
import {type Grain, periodLabel} from '../periods';
import type {Report} from '../report';
import type {CategoryKey} from '../types';

interface Props {
  report: Report;
  categories: Categories;
  currency: string;
  onOpen: (category: CategoryKey) => void;
}

const PER: Record<Grain, string> = {week: 'a week', month: 'a month', year: 'a year', all: 'a year'};

/**
 * Small multiples: a little bar chart per category over the main chart's periods (twelve months in the month view),
 * biggest first, the period shown marked. Each has its own scale, so the shape tells the trend; a click opens the
 * category with its month by month.
 */
export function CategoryTrends({report, categories, currency, onOpen}: Props) {
  const {series, chartGrain} = report;
  const marked = series.findIndex(item => item.period === report.period);
  const trends = categories.list
    .filter(category => category.spending)
    .map(category => {
      const values = series.map(item => Math.max(0, item.categories.get(category.key) ?? 0));
      return {category, values, total: values.reduce((sum, value) => sum + value, 0)};
    })
    .filter(trend => trend.total >= 0.5)
    .sort((first, second) => second.total - first.total);

  if (trends.length === 0) return <p className="empty">No spending over these periods.</p>;
  const first = series[0]?.period;
  const last = series[series.length - 1]?.period;

  return (
    <>
      <p className="hint trends-hint">
        {first && last && `${periodLabel(first, chartGrain)} to ${periodLabel(last, chartGrain)}. `}
        Each chart has its own scale: compare their shapes, the amounts are under them.
      </p>
      <ul className="trends">
        {trends.map(({category, values, total}) => {
          const top = Math.max(...values, 1);
          return (
            <li key={category.key}>
              <button
                type="button"
                className="trend-card"
                aria-label={`${category.label}: ${money(total, currency)} over these periods. Open it`}
                onClick={() => onOpen(category.key)}
              >
                <span className="trend-card-name">
                  <span aria-hidden="true">{category.icon}</span>
                  <span className="trend-card-label">{category.label}</span>
                </span>
                <span className="trend-card-bars" aria-hidden="true">
                  {values.map((value, index) => (
                    <span
                      key={series[index].period}
                      className={`trend-card-bar${index === marked ? ' is-marked' : ''}`}
                      style={{height: `${(value / top) * 100}%`}}
                      title={`${periodLabel(series[index].period, chartGrain)}: ${money(value, currency)}`}
                    />
                  ))}
                </span>
                <span className="trend-card-total">
                  {money(total / values.length, currency)} <small>{PER[chartGrain]}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
