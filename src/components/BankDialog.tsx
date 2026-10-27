import {useEffect, useState} from 'react';
import {fetchBanks} from '../api';
import {useDialog} from '../useDialog';
import {plain} from '../text';

interface Props {
  /** Banks already connected, by name: they show as such. */
  connected: string[];
  busy: boolean;
  onConnect: (bank: {name: string; country: string}) => void;
  onClose: () => void;
}

/** Countries Enable Banking covers, the owner's first. */
const COUNTRIES: [string, string][] = [
  ['FR', 'France'],
  ['BE', 'Belgium'],
  ['DE', 'Germany'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['NL', 'Netherlands'],
  ['PT', 'Portugal'],
  ['IE', 'Ireland'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['AT', 'Austria'],
  ['FI', 'Finland'],
  ['SE', 'Sweden'],
  ['DK', 'Denmark'],
  ['NO', 'Norway'],
  ['PL', 'Poland'],
];

/** Shown first when the country lists them. */
const FAVOURITES = ['Revolut', 'Crédit Coopératif'];

/**
 * Picks a bank to connect through Enable Banking. In its free mode the app only reads accounts its owner linked in
 * the Enable Banking Control Panel, so a bank must be linked there first.
 */
export function BankDialog({connected, busy, onConnect, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [country, setCountry] = useState('FR');
  // The list fetched for a country; while another country loads, nothing shows.
  const [loaded, setLoaded] = useState<{country: string; banks?: string[]; failure?: string} | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let current = true;
    fetchBanks(country)
      .then(banks => current && setLoaded({country, banks}))
      .catch(
        (error: unknown) =>
          current && setLoaded({country, failure: error instanceof Error ? error.message : 'No bank list'}),
      );
    return () => {
      current = false;
    };
  }, [country]);
  const banks = loaded?.country === country ? (loaded.banks ?? null) : null;
  const failure = loaded?.country === country ? (loaded.failure ?? null) : null;

  const words = plain(query).split(/\s+/).filter(Boolean);
  const matching = (banks ?? []).filter(name => words.every(word => plain(name).includes(word)));
  const favourites = matching.filter(name => FAVOURITES.includes(name));
  const others = matching.filter(name => !FAVOURITES.includes(name));

  const line = (name: string) => (
    <li key={name}>
      <span>{name}</span>
      {connected.includes(name) ? (
        <span className="muted">connected</span>
      ) : (
        <button type="button" className="button" disabled={busy} onClick={() => onConnect({name, country})}>
          Connect
        </button>
      )}
    </li>
  );

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog bank-dialog"
      aria-labelledby="bank-dialog-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="bank-dialog-title">Connect a bank</h2>
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">
          Link the bank's accounts in the Enable Banking Control Panel first: its free mode only reads accounts linked
          there. Then pick the bank here and approve in its app.
        </p>
      </header>
      <div className="bank-filters">
        <select
          className="select"
          aria-label="Country"
          value={country}
          onChange={event => setCountry(event.target.value)}
        >
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <input
          className="text-input"
          type="search"
          aria-label="Find a bank"
          placeholder="Find a bank"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>
      <ul className="bank-list">
        {failure && <li className="empty">{failure}</li>}
        {!banks && !failure && <li className="empty">Loading the banks…</li>}
        {banks && matching.length === 0 && <li className="empty">No bank matches.</li>}
        {favourites.map(line)}
        {others.map(line)}
      </ul>
      <footer className="dialog-foot">
        <button type="button" className="button is-quiet" onClick={closeDialog}>
          Close
        </button>
      </footer>
    </dialog>
  );
}
