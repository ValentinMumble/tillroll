import {useMemo, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {MONTHS, today} from '../periods';
import type {Row} from '../rows';
import {loadTripSort, saveTripSort, type TripSort} from '../storage';
import {trainStats, type TrainStats} from '../trains';
import {daysLabel, tripFacts, tripKeyOf, type TripSummary, tripSummaries} from '../trips';
import type {Labels, Trip, Trips} from '../types';
import {BarStrip} from './BarStrip';
import {ChartTip} from './ChartTip';
import {FactList} from './FactList';
import {TripDialog} from './TripDialog';
import {TripMap} from './TripMap';

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[];
  currency: string;
  categories: Categories;
  /** The labels marked as trips. */
  trips: Trips;
  /** Shows a label's payments: a trip's, from its dialog. */
  onOpenLabel: (label: string) => void;
  /** A trip's days and place as set in its dialog; null makes it a plain label again. */
  onTrip: (label: string, trip: Trip | null) => void;
  onLabels: (changes: Labels) => void;
}

function ticketCount(count: number) {
  return `${count} ticket${count === 1 ? '' : 's'}`;
}

/** The lines taken most, as bars: how many tickets, what one cost on average. */
function LineList({lines, currency}: {lines: TrainStats['lines']; currency: string}) {
  const top = Math.max(1, ...lines.map(line => line.count));
  return (
    <figure className="stat-bars train-lines">
      <figcaption>Your lines</figcaption>
      <ul className="bars">
        {lines.map(line => (
          <li key={line.name} className="bar-row is-static">
            <span className="bar-label">
              <span className="bar-name">{line.name}</span>
            </span>
            <span className="bar-value">{ticketCount(line.count)}</span>
            <span className="bar-change muted">{money(line.total / line.count, currency)} each</span>
            <span className="bar-track">
              <span className="bar-fill" style={{width: `${(line.count / top) * 100}%`}} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const TRIP_SORTS: {key: TripSort; label: string}[] = [
  {key: 'latest', label: 'Latest'},
  {key: 'biggest', label: 'Biggest'},
  {key: 'day', label: 'A day'},
];

/** A trip's categories under this share of what it cost go into one grey "Other" part, to keep the bars readable. */
const SMALL = 0.08;

/**
 * The trips side by side, the latest first (or the biggest, or the priciest a day): a trip's name opens its dialog
 * (days, place, payments); its bar is as long as what it cost (against the biggest trip), split by category, each
 * part with its tooltip, the small ones together as "Other". A trip with few of its days labelled says "to complete"
 * and sorts last a day.
 */
function TripList({
  trips,
  currency,
  categories,
  onOpen,
}: {
  trips: TripSummary[];
  currency: string;
  categories: Categories;
  onOpen: (label: string) => void;
}) {
  // The part under the pointer (or tapped).
  const [hovered, setHovered] = useState<{trip: string; key: string} | null>(null);
  const [sort, setSort] = useState<TripSort>(loadTripSort);
  const top = Math.max(1, ...trips.map(trip => trip.total));
  const perDay = (trip: TripSummary) => (trip.sparse || trip.days < 2 ? 0 : trip.total / trip.days);
  const sorted = [...trips].sort((first, second) =>
    sort === 'biggest' ? second.total - first.total : sort === 'day' ? perDay(second) - perDay(first) : 0,
  );
  // Each trip's parts: its big categories, then the small ones together.
  const parts = (trip: TripSummary) => {
    const big = trip.categories.filter(([, value]) => value >= trip.total * SMALL);
    const small = trip.categories.filter(([, value]) => value < trip.total * SMALL);
    const rest = small.reduce((sum, [, value]) => sum + value, 0);
    return [
      ...big.map(([key, value]) => ({key, value, names: [] as string[]})),
      ...(rest > 0
        ? [{key: 'other', value: rest, names: small.map(([key]) => categories.byKey[key]?.label ?? key)}]
        : []),
    ];
  };
  const keys = [...new Set(trips.flatMap(trip => parts(trip).map(part => part.key)))];
  return (
    <figure className="stat-bars trip-lines">
      <figcaption>
        <span>Your trips</span>
        <span className="segmented is-small" role="group" aria-label="Sort trips by">
          {TRIP_SORTS.map(item => (
            <button
              key={item.key}
              type="button"
              aria-pressed={sort === item.key}
              onClick={() => {
                setSort(item.key);
                saveTripSort(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </span>
      </figcaption>
      <ul>
        {sorted.map(trip => (
          <li key={trip.name}>
            <span className="trip-line-head">
              <button
                type="button"
                className="trip-line-name"
                title="Its days, place and payments"
                onClick={() => onOpen(trip.name)}
              >
                {trip.name}
              </button>
              {trip.sparse && (
                <span
                  className="tag"
                  title={`Payments on ${trip.paidDays} of its ${trip.days} days: add the others from its days`}
                >
                  to complete
                </span>
              )}
            </span>
            <strong className="trip-line-total">{money(trip.total, currency)}</strong>
            <span className="muted trip-line-days">
              {daysLabel(trip.from, trip.to)} · {trip.days} day{trip.days === 1 ? '' : 's'}
            </span>
            {/* A day trip, or one known only by its booking, has no cost a day to speak of. */}
            <span className="muted trip-line-day">{perDay(trip) ? `${money(perDay(trip), currency)} a day` : ''}</span>
            <span
              className="trip-bar"
              style={{width: `${(trip.total / top) * 100}%`}}
              onPointerLeave={() => setHovered(null)}
            >
              {parts(trip).map(part => {
                const shown = hovered?.trip === trip.name && hovered.key === part.key;
                const category = categories.byKey[part.key];
                return (
                  <span
                    key={part.key}
                    className={`trip-bar-part${part.names.length ? ' is-rest' : ''}`}
                    style={{
                      ...(part.names.length ? {} : colourStyle(categories.colours[part.key])),
                      flexGrow: part.value,
                    }}
                    onPointerEnter={event => {
                      if (event.pointerType === 'mouse') setHovered({trip: trip.name, key: part.key});
                    }}
                    // A tap shows it on a phone, and hides it again.
                    onClick={() => setHovered(shown ? null : {trip: trip.name, key: part.key})}
                  >
                    {shown && (
                      <ChartTip bottom="14px">
                        <strong>{part.names.length ? 'Other' : `${category?.icon} ${category?.label}`}</strong>
                        <span>
                          {money(part.value, currency)} · {Math.round((part.value / trip.total) * 100)}%
                        </span>
                        {part.names.length > 0 && <span>{part.names.join(', ')}</span>}
                      </ChartTip>
                    )}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="trip-legend">
        {keys
          .filter(key => key !== 'other')
          .map(key => (
            <span key={key}>
              <span className="cat-dot" style={colourStyle(categories.colours[key])} aria-hidden="true" />{' '}
              {categories.byKey[key]?.label}
            </span>
          ))}
        {keys.includes('other') && (
          <span>
            <span className="cat-dot is-rest" aria-hidden="true" /> Other (small parts)
          </span>
        )}
      </p>
    </figure>
  );
}

/**
 * The trips: where they went on a map, side by side, and together as facts; a trip's name or bubble opens its dialog
 * (days, place, payments). Then the train tickets on their own, when there are some.
 */
export function TripsView({rows, currency, categories, trips, onOpenLabel, onTrip, onLabels}: Props) {
  const tripList = useMemo(() => tripSummaries(rows, trips), [rows, trips]);
  const trains = useMemo(() => trainStats(rows, currency), [rows, currency]);
  // The trip whose dialog is open, by its label.
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  return (
    <>
      <section className="card fun-stats">
        <header className="card-head">
          <h2>Trips</h2>
          <span className="hint">
            {tripList.length > 0
              ? 'from the labels marked as trips; a trip costs what its payments cost once refunds and paybacks are off'
              : 'Pick "Make it a trip" on a label in Labels, on the Categories tab: each trip gets a line here.'}
          </span>
        </header>
        {tripList.length > 0 && <TripMap trips={tripList} currency={currency} onOpen={setOpenTrip} />}
        {tripList.length > 0 && (
          <TripList trips={tripList} currency={currency} categories={categories} onOpen={setOpenTrip} />
        )}
        {tripList.length > 0 && <FactList facts={tripFacts(tripList, currency, categories, today().slice(0, 4))} />}
      </section>
      {trains && (
        <section className="card fun-stats">
          <header className="card-head">
            <h2>Trains</h2>
            <span className="hint">from your train tickets and their route labels; distances and CO₂ are rough</span>
          </header>
          <div className="stat-charts">
            <BarStrip
              caption="Spent on train tickets, by year"
              values={trains.years.map(year => year.total)}
              labels={trains.years.map(year => `’${year.year.slice(2)}`)}
              titles={trains.years.map(year => `${year.year}, ${ticketCount(year.count)}`)}
              currency={currency}
            />
            <BarStrip
              caption="By month of the year, every year together"
              values={trains.months}
              labels={MONTHS.map(month => month.charAt(0))}
              titles={MONTHS}
              currency={currency}
            />
          </div>
          {trains.lines.length > 0 && <LineList lines={trains.lines} currency={currency} />}
          <FactList facts={trains.facts} />
        </section>
      )}
      {openTrip && (
        <TripDialog
          label={openTrip}
          trip={trips[tripKeyOf(trips, openTrip) ?? openTrip] ?? {}}
          rows={rows}
          currency={currency}
          categories={categories}
          onSave={trip => onTrip(openTrip, trip)}
          onLabels={onLabels}
          onShowPayments={() => onOpenLabel(openTrip)}
          onClose={() => setOpenTrip(null)}
        />
      )}
    </>
  );
}
