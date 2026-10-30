import {useMemo} from 'react';
import type {Categories} from '../categories';
import type {Row} from '../rows';
import type {Trips} from '../types';
import {yearFacts} from '../year';
import {FactList} from './FactList';

interface Props {
  year: string;
  /** Every payment of one currency, all time. */
  rows: Row[];
  moneyIn: number;
  toSavings: number;
  trips: Trips;
  currency: string;
  categories: Categories;
  /** The year is still going: its facts are so far. */
  ongoing: boolean;
}

/** The year picked, in a few numbers (see yearFacts), as the fun stats' tiles. */
export function YourYear({year, rows, moneyIn, toSavings, trips, currency, categories, ongoing}: Props) {
  const facts = useMemo(
    () => yearFacts({year, rows, moneyIn, toSavings, trips, currency, categories}),
    [year, rows, moneyIn, toSavings, trips, currency, categories],
  );
  if (facts.length === 0) return null;
  return (
    <section className="card fun-stats your-year">
      <header className="card-head">
        <h2>Your {year}</h2>
        <span className="hint">{ongoing ? 'so far, in a few numbers' : 'the year in a few numbers'}</span>
      </header>
      <FactList facts={facts} />
    </section>
  );
}
