import {useState} from 'react';
import type {Insight} from '../report';

const SHOWN = 3;

/** "What stands out", kept quiet: a short plain list at the end of the overview, three notes and the rest on demand. */
export function Insights({insights}: {insights: Insight[]}) {
  const [all, setAll] = useState(false);
  if (insights.length === 0) return null;
  const shown = all ? insights : insights.slice(0, SHOWN);
  return (
    <section className="notes" aria-labelledby="notes-title">
      <h2 id="notes-title">Notes</h2>
      <ul>
        {shown.map(insight => (
          <li key={insight.text}>
            <span aria-hidden="true">{insight.icon}</span>
            {insight.text}
          </li>
        ))}
      </ul>
      {insights.length > SHOWN && (
        <button type="button" className="link-button" onClick={() => setAll(!all)}>
          {all ? 'Fewer notes' : `${insights.length - SHOWN} more notes`}
        </button>
      )}
    </section>
  );
}
