import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import { tidyLabel, withLabel } from '../labels'
import { dayLabel, periodEnd, today, weekdayLabel, weekdayOf } from '../periods'
import type { Row } from '../report'
import type { CategoryKey, Labels } from '../types'

interface Props {
  /** The payments of one currency, newest first. */
  rows: Row[]
  categories: Categories
  currency: string
  /** The year to open on: the one of the period shown. */
  initialYear: string
  /** A month's name opens that month in the overview. */
  onOpenMonth: (month: string) => void
  /** Every label in use, offered while typing one. */
  labelNames: string[]
  onLabels: (changes: Labels) => void
}

const MONTHS = Array.from({ length: 12 }, (_value, index) => String(index + 1).padStart(2, '0'))
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
/** Days are coloured in five steps, from the quietest spending days to the biggest. */
const STEPS = 5
/** Big planned payments that can be left out, so the everyday spending shows. */
const FIXED_COSTS: CategoryKey[] = ['bills', 'home']

/** A round amount near a value, for the scale: 12 → 10, 37 → 40, 140 → 150. */
function roundAmount(value: number) {
  if (value <= 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const factor = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].reduce((best, item) =>
    Math.abs(item * magnitude - value) < Math.abs(best * magnitude - value) ? item : best,
  )
  return factor * magnitude
}

function monthName(year: string, month: string) {
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  })
}

/**
 * A whole year, one square per day, darker the more was spent; every year with data can be picked. A click on a day
 * lists its payments beside the months (at the bottom on a phone); a shift-click, or "Extend to another day", picks a
 * run of days, like a trip, whose payments can get one label together.
 */
export function Calendar({ rows, categories, currency, initialYear, onOpenMonth, labelNames, onLabels }: Props) {
  const firstYear = rows.at(-1)?.date.slice(0, 4) ?? initialYear
  const lastYear = rows[0]?.date.slice(0, 4) ?? initialYear
  const years: string[] = []
  for (let year = Number(firstYear); year <= Number(lastYear); year += 1) years.push(String(year))
  const [year, setYear] = useState(years.includes(initialYear) ? initialYear : lastYear)
  // The days picked: one day, or a run of days.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [extending, setExtending] = useState(false)
  // Payments of the range left out of the label.
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [labelText, setLabelText] = useState('')
  const [withoutFixed, setWithoutFixed] = useState(false)
  const now = today()

  // What went out each day, over every year, and the payments behind it.
  const allDays = useMemo(() => {
    const byDay = new Map<string, { total: number; rows: Row[] }>()
    for (const row of rows) {
      if (!row.counts || (withoutFixed && FIXED_COSTS.includes(row.category))) continue
      const day = byDay.get(row.date) ?? { total: 0, rows: [] }
      day.total += row.spend
      day.rows.push(row)
      byDay.set(row.date, day)
    }
    return byDay
  }, [rows, withoutFixed])
  const days = useMemo(() => new Map([...allDays].filter(([date]) => date.startsWith(year))), [allDays, year])

  // The step limits, round amounts that split the spending days of every year in five groups: the same scale for
  // each year, so their colours compare.
  const limits = useMemo(() => {
    const totals = [...allDays.values()].map((day) => day.total).filter((total) => total > 0)
    totals.sort((first, second) => first - second)
    const rounded = Array.from({ length: STEPS - 1 }, (_value, index) =>
      roundAmount(totals[Math.floor(((index + 1) * totals.length) / STEPS)] ?? 0),
    )
    return [...new Set(rounded)].filter((limit) => limit > 0)
  }, [allDays])
  const stepOf = (total: number) => (total <= 0 ? 0 : 1 + limits.filter((limit) => total > limit).length)
  const whole = (value: number) => money(value, currency)

  const firstDay = rows.at(-1)?.date ?? now
  const yearTotal = [...days.values()].reduce((sum, day) => sum + day.total, 0)
  const payments = [...days.values()].reduce((sum, day) => sum + day.rows.filter((row) => row.spend > 0).length, 0)
  const busiest = [...days].sort((first, second) => second[1].total - first[1].total)[0]

  // The payments of the days picked, oldest first (a range may cross into another year).
  const picked = range
    ? rows
        .filter((row) => row.counts && row.date >= range.from && row.date <= range.to)
        .sort((first, second) => (`${first.date} ${first.time ?? ''}` < `${second.date} ${second.time ?? ''}` ? -1 : 1))
    : []
  const ticked = picked.filter((row) => !unticked.has(row.id))
  const pickedTotal = picked.reduce((sum, row) => sum + row.spend, 0)
  const oneDay = Boolean(range && range.from === range.to)

  function pickDay(date: string, event: MouseEvent) {
    if (range && (extending || event.shiftKey)) {
      const [from, to] = [range.from, date].sort()
      setRange({ from, to })
    } else setRange(range && oneDay && range.from === date ? null : { from: date, to: date })
    setExtending(false)
    setUnticked(new Set())
  }

  function label() {
    const name = tidyLabel(labelText)
    if (!name || ticked.length === 0) return
    onLabels(Object.fromEntries(ticked.map((row) => [row.id, withLabel(row.labels, name)])))
    setLabelText('')
  }

  // Many years scroll inside their bar (a phone is too narrow for them all): the one shown stays in view.
  const yearsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = yearsRef.current
    const button = bar?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (bar && button) bar.scrollLeft = button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2
  }, [year])

  return (
    <section className="card calendar">
      <header className="card-head">
        <h2>Calendar</h2>
        <div className="segmented is-small calendar-years" role="group" aria-label="Year" ref={yearsRef}>
          {years.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === year}
              onClick={() => {
                setYear(item)
                setRange(null)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <p className="calendar-summary">
        <strong>{money(yearTotal, currency)}</strong> in {year}
        {withoutFixed && ' without bills and rent'} · {payments} payments
        {busiest && busiest[1].total > 0 && (
          <>
            {' '}
            · biggest day {dayLabel(busiest[0])} ({money(busiest[1].total, currency)})
          </>
        )}
      </p>

      <div className="calendar-body">
        <div className="calendar-main">
          <div className="months">
            {MONTHS.map((month) => {
              const first = `${year}-${month}-01`
              const length = Number(periodEnd(`${year}-${month}`, 'month').slice(8))
              const monthTotal = [...days]
                .filter(([date]) => date.startsWith(`${year}-${month}`))
                .reduce((sum, [, day]) => sum + day.total, 0)
              return (
                <div key={month} className="month">
                  <button
                    type="button"
                    className="month-head"
                    title={`Open ${monthName(year, month)} in the overview`}
                    onClick={() => onOpenMonth(`${year}-${month}`)}
                  >
                    <span>{monthName(year, month)}</span>
                    <span className="muted">{monthTotal > 0 ? money(monthTotal, currency) : ''}</span>
                  </button>
                  <div className="month-grid" aria-label={`${monthName(year, month)} ${year}`}>
                    {WEEKDAY_INITIALS.map((initial, index) => (
                      <span key={index} className="weekday" aria-hidden="true">
                        {initial}
                      </span>
                    ))}
                    {Array.from({ length: weekdayOf(first) }, (_value, index) => (
                      <span key={`gap-${index}`} aria-hidden="true" />
                    ))}
                    {Array.from({ length }, (_value, index) => {
                      const date = `${year}-${month}-${String(index + 1).padStart(2, '0')}`
                      const day = days.get(date)
                      const outside = date > now || date < firstDay
                      const inRange = Boolean(range && date >= range.from && date <= range.to)
                      const label = `${weekdayLabel(date)}: ${day ? money(day.total, currency) : 'nothing spent'}`
                      return (
                        <button
                          key={date}
                          type="button"
                          className={`day step-${stepOf(day?.total ?? 0)}${outside ? ' is-outside' : ''}${
                            inRange ? ' is-selected' : ''
                          }${date === now ? ' is-today' : ''}`}
                          title={outside ? weekdayLabel(date) : label}
                          aria-label={outside ? `${weekdayLabel(date)}: no data` : label}
                          aria-pressed={inRange}
                          disabled={outside}
                          onClick={(event) => pickDay(date, event)}
                        >
                          <span className="day-number" aria-hidden="true">
                            {index + 1}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="calendar-foot">
            <label
              className="check"
              title={`Leaves out ${FIXED_COSTS.map((key) => categories.byKey[key]?.label).join(' and ')}`}
            >
              <input
                type="checkbox"
                checked={withoutFixed}
                onChange={(event) => setWithoutFixed(event.target.checked)}
              />
              Leave out bills and rent
            </label>
            <ul className="calendar-legend" aria-label="Colour scale, spent in a day">
              {limits.length > 0 && (
                <li>
                  <span className="day step-1" aria-hidden="true" />
                  up to {whole(limits[0])}
                </li>
              )}
              {limits.slice(1).map((limit, index) => (
                <li key={limit}>
                  <span className={`day step-${index + 2}`} aria-hidden="true" />
                  {whole(limits[index])} to {whole(limit)}
                </li>
              ))}
              {limits.length > 0 && (
                <li>
                  <span className={`day step-${limits.length + 1}`} aria-hidden="true" />
                  over {whole(limits[limits.length - 1])}
                </li>
              )}
            </ul>
          </div>
        </div>

        <aside className={`day-detail${range ? ' is-open' : ''}`} aria-live="polite">
          {!range ? (
            <p className="muted">
              Pick a day to see its payments. Shift-click another day to pick a run of days, like a trip, and label them
              together.
            </p>
          ) : (
            <>
              <header className="day-detail-head">
                <h3>
                  {oneDay
                    ? weekdayLabel(range.from, true)
                    : `${dayLabel(range.from, range.from.slice(0, 4) !== range.to.slice(0, 4))} to ${dayLabel(range.to, true)}`}
                </h3>
                <button type="button" className="link-button" aria-label="Close" onClick={() => setRange(null)}>
                  ✕
                </button>
              </header>
              <p className="muted">
                {money(pickedTotal, currency, true)} · {picked.length === 1 ? '1 payment' : `${picked.length} payments`}
                {!oneDay && ` · ${Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1} days`}
              </p>
              {oneDay && (
                <button type="button" className="link-button" onClick={() => setExtending(!extending)}>
                  {extending ? 'Now pick the last day…' : 'Extend to another day'}
                </button>
              )}
              {picked.length > 0 && (
                <ul>
                  {picked.map((row) => (
                    <li key={row.id}>
                      <input
                        type="checkbox"
                        aria-label={`Include ${row.store}, ${dayLabel(row.date)}`}
                        checked={!unticked.has(row.id)}
                        onChange={() => {
                          const next = new Set(unticked)
                          if (next.has(row.id)) next.delete(row.id)
                          else next.add(row.id)
                          setUnticked(next)
                        }}
                      />
                      <span aria-hidden="true">{categories.byKey[row.category]?.icon}</span>
                      <span className="day-detail-store">
                        <span className="payment-time">
                          {oneDay ? (row.time ?? '') : `${dayLabel(row.date)} ${row.time ?? ''}`}{' '}
                        </span>
                        {row.store}
                        {row.labels.map((item) => (
                          <span key={item} className="label-tag">
                            # {item}
                          </span>
                        ))}
                      </span>
                      <span className="payment-amount">{money(row.amount, row.currency, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {picked.length > 0 && (
                <form
                  className="label-range"
                  onSubmit={(event) => {
                    event.preventDefault()
                    label()
                  }}
                >
                  <input
                    className="text-input"
                    list="tillroll-calendar-labels"
                    aria-label="Label for the ticked payments"
                    placeholder="Label, like Italy trip"
                    value={labelText}
                    maxLength={40}
                    onChange={(event) => setLabelText(event.target.value)}
                  />
                  <button type="submit" className="button" disabled={!tidyLabel(labelText) || ticked.length === 0}>
                    Label {ticked.length}
                  </button>
                  <datalist id="tillroll-calendar-labels">
                    {labelNames.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </form>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
