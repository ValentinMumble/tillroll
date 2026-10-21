import { ImportButton } from './ImportButton'

const REPOSITORY = 'https://github.com/ValentinMumble/tillroll'

interface Props {
  isOwner: boolean
  busy: string | null
  onSample: () => void
  onImport: (file: File) => void
  onConnect: () => void
}

/** The first screen, before there is any data. */
export function Landing({ isOwner, busy, onSample, onImport, onConnect }: Props) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <p className="eyebrow">Your spending, on one till roll</p>
        <h1>See where your money goes, week by week and month by month.</h1>
        <p className="lede">
          Tillroll sorts your Revolut payments by store and by category, compares each week and month with your usual
          ones, and points out what changed.
        </p>
        <div className="landing-actions">
          {isOwner ? (
            <button type="button" className="button is-primary" disabled={busy !== null} onClick={onConnect}>
              {busy === 'connect' ? 'Opening the bank…' : 'Connect a bank'}
            </button>
          ) : (
            <button type="button" className="button is-primary" onClick={onSample}>
              Try it with sample data
            </button>
          )}
          <ImportButton label="Import a Revolut statement" busy={busy === 'import'} onFile={onImport} />
        </div>
      </div>
      <div className="landing-side">
        <div className="card">
          <h2>Get your statement</h2>
          <ol className="steps">
            <li>In the Revolut app, open your account and tap ···, then Statement.</li>
            <li>Choose Excel (or CSV) and the months you want.</li>
            <li>
              Save the file, then import it here. Import more months any time: Tillroll skips what it already has.
            </li>
          </ol>
        </div>
        {!isOwner && (
          <div className="card">
            <h2>Live bank sync</h2>
            <p>
              This site syncs live with its owner's bank only. To sync yours, run your own copy: about 15 minutes, all
              free.
            </p>
            <a href={`${REPOSITORY}#run-your-own`}>How to set it up</a>
          </div>
        )}
      </div>
    </section>
  )
}
