import type {Fact} from '../stats';

/** The facts as a grid of tiles: an icon, what it is, the big value, a line of detail. */
export function FactList({facts}: {facts: Fact[]}) {
  return (
    <ul className="facts-grid">
      {facts.map(fact => (
        <li key={fact.title}>
          <span className="fact-icon" aria-hidden="true">
            {fact.icon}
          </span>
          <span className="fact-title">{fact.title}</span>
          <strong className="fact-value">{fact.value}</strong>
          <span className="fact-detail">{fact.detail}</span>
        </li>
      ))}
    </ul>
  );
}
