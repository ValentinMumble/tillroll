/** The chart's columns while loading: a fixed, gently varied outline, the same on every load. */
const COLUMNS = [62, 48, 55, 40, 70, 58, 66, 45, 74, 52, 60, 38]

/** A list card's outline: a title, then rows of a name and a bar. */
function ListOutline({ rows }: { rows: number }) {
  return (
    <section className="card">
      <span className="skeleton is-title" />
      {Array.from({ length: rows }, (_value, index) => (
        <div key={index} className="skeleton-row">
          <span className="skeleton is-line" style={{ width: `${55 - index * 6}%` }} />
          <span className="skeleton is-bar" style={{ width: `${90 - index * 15}%` }} />
        </div>
      ))}
    </section>
  )
}

/**
 * The overview's outline, in grey, while the owner's payments load: the period bar, the total and its chart, then
 * the top categories and stores. It takes the place of the page without moving it once the data is in.
 */
export function OverviewSkeleton() {
  return (
    <div className="skeleton-view" role="status" aria-busy="true" aria-label="Loading your spending">
      <div className="skeleton-toolbar">
        <span className="skeleton is-pill" style={{ width: 'min(300px, 56%)' }} />
        <span className="skeleton is-pill" style={{ width: 'min(170px, 34%)' }} />
      </div>
      <section className="card">
        <span className="skeleton is-line" style={{ width: '28%' }} />
        <span className="skeleton is-hero" />
        <span className="skeleton is-line" style={{ width: '52%' }} />
        <div className="skeleton-chart">
          {COLUMNS.map((height, index) => (
            <span key={index} className="skeleton" style={{ height: `${height}%` }} />
          ))}
        </div>
      </section>
      <div className="columns">
        <ListOutline rows={5} />
        <ListOutline rows={5} />
      </div>
    </div>
  )
}
