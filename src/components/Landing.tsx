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
              {busy === 'connect' ? 'Opening Revolut…' : 'Connect Revolut'}
            </button>
          ) : (
            <button type="button" className="button is-primary" onClick={onSample}>
              Try it with sample data
            </button>
          )}
          <ImportButton label="Import a Revolut statement" busy={busy === 'import'} onFile={onImport} />
        </div>
        {!isOwner && (
          <p className="fine">The statement is read in your browser and stays there. Nothing is uploaded.</p>
        )}
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
            <h2>Live Revolut sync</h2>
            <p>
              Tillroll can also read a Revolut account directly, through Open Banking (Enable Banking). Its free mode
              only reaches the accounts of the person who runs the site, so here it is for the owner only. To sync your
              own account, run your own copy: it takes a free Enable Banking app, a Vercel project and about 15 minutes.
            </p>
            <a href={`${REPOSITORY}#run-your-own`}>How to set it up</a>
          </div>
        )}
      </div>
    </section>
  )
}
