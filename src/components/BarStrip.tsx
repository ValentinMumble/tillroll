import {useState} from 'react';
import {money} from '../format';
import {ChartTip} from './ChartTip';

/**
 * One series of bars with their labels under them (weekdays, hours, months): one colour, the length is the value; the
 * biggest is the strong one, with its amount. Each bar has a tooltip with its full name and amount.
 */
export function BarStrip({
  values,
  labels,
  titles = labels,
  currency,
  caption,
}: {
  values: number[];
  labels: string[];
  titles?: string[];
  currency: string;
  caption: string;
}) {
  // The bar under the pointer (or tapped), with a tooltip like the month chart's.
  const [hovered, setHovered] = useState<number | null>(null);
  const top = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  return (
    <figure className="stat-bars">
      <figcaption>{caption}</figcaption>
      <div className="stat-bars-plot" onPointerLeave={() => setHovered(null)}>
        {values.map((value, index) => (
          <div
            key={labels[index] + index}
            className="stat-bar"
            onPointerEnter={event => {
              if (event.pointerType === 'mouse') setHovered(index);
            }}
            // A tap shows it on a phone, and hides it again.
            onClick={() => setHovered(shown => (shown === index ? null : index))}
          >
            <span className="stat-bar-value">{index === best ? money(value, currency) : ''}</span>
            <span
              className={`stat-bar-fill${index === best ? ' is-best' : ''}`}
              style={{height: `${(value / top) * 100}%`}}
            />
            <span className="stat-bar-label">{labels[index]}</span>
            {hovered === index && (
              // Above the bar: past the label row under it and the bar's own height in the plot row.
              <ChartTip column={index} columns={values.length} bottom={`calc(24px + (100% - 34px) * ${value / top})`}>
                <strong>{titles[index]}</strong>
                <span>{money(value, currency)}</span>
              </ChartTip>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}
