import type {Insight} from '../report';

/** "What stands out", kept quiet: a short plain list at the end of the overview, every note shown. */
export function Insights({insights}: {insights: Insight[]}) {
  if (insights.length === 0) return null;
  return (
    <section className="notes" aria-labelledby="notes-title">
      <h2 id="notes-title">Notes</h2>
      <ul>
        {insights.map(insight => (
          <li key={insight.text}>
            <span aria-hidden="true">{insight.icon}</span>
            {insight.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
