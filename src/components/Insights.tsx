import type { Insight } from '../report'

export function Insights({ insights }: { insights: Insight[] }) {
  return (
    <section className="card insights">
      <header className="card-head">
        <h2>What stands out</h2>
      </header>
      {insights.length === 0 ? (
        <p className="empty">Not enough history yet to compare.</p>
      ) : (
        <ul>
          {insights.map((insight) => (
            <li key={insight.text}>
              <span className="insight-icon" aria-hidden="true">
                {insight.icon}
              </span>
              <p>{insight.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
