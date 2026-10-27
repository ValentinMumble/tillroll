import type {Categories} from '../categories';
import type {Grain} from '../periods';
import type {Report} from '../report';
import type {Row} from '../rows';
import type {Tab} from '../tabs';
import type {Balance, Budgets, CategoryKey, Labels} from '../types';
import {Balances} from './Balances';
import {CategoryBreakdown, type Focus, StoreBreakdown} from './Breakdown';
import {BudgetCard} from './Budgets';
import {FixedSplit} from './FixedSplit';
import {Insights} from './Insights';
import {LatestPayments} from './LatestPayments';
import {MoneyFlow} from './MoneyFlow';
import {PeriodChart} from './PeriodChart';
import {RegularPayments} from './RegularPayments';
import {Summary} from './Summary';

interface Props {
  report: Report;
  period: string;
  grain: Grain;
  currency: string;
  categories: Categories;
  /** The period's payments, newest first. */
  rows: Row[];
  balances: Balance[];
  budgets: Budgets;
  /** Stores waiting to be sorted, and payments whose category is a guess to check. */
  toSort: number;
  toCheck: number;
  showBanks: boolean;
  labelNames: string[];
  focus: Focus | null;
  onFocus: (focus: Focus | null) => void;
  /** Another view, from its top. */
  onShow: (tab: Tab) => void;
  onSeeAllPayments: () => void;
  onSelectPeriod: (period: string) => void;
  onSort: () => void;
  onOpenStore: (store: {key: string; name: string}) => void;
  onEditCategories: () => void;
  onEditStores: () => void;
  onCategorize: (rows: Row[], category: CategoryKey | null, scope: string) => void;
  onCreateCategory: (rows: Row[], label: string, icon: string, scope: string) => void;
  onLabels: (changes: Labels) => void;
}

/**
 * The overview, in a fixed order (see docs/visual-guidelines.md): the period so far, the balances, what is waiting to
 * be sorted or checked, the latest payments, then the period chart, top categories and stores, budgets, money in and
 * out, fixed and flexible, regular payments and insights.
 */
export function Overview({
  report,
  period,
  grain,
  currency,
  categories,
  rows,
  balances,
  budgets,
  toSort,
  toCheck,
  showBanks,
  labelNames,
  focus,
  onFocus,
  onShow,
  onSeeAllPayments,
  onSelectPeriod,
  onSort,
  onOpenStore,
  onEditCategories,
  onEditStores,
  onCategorize,
  onCreateCategory,
  onLabels,
}: Props) {
  const breakdown = {report, categories, currency, focus, onFocus};
  return (
    <>
      <section className="receipt">
        <Summary report={report} period={period} grain={grain} currency={currency} categories={categories} />
      </section>
      <Balances balances={balances} currency={currency} onSavings={() => onShow('savings')} />
      {toSort > 0 && (
        <button type="button" className="sort-banner" onClick={onSort}>
          <span aria-hidden="true">🗂️</span>
          {toSort === 1 ? '1 store to sort' : `${toSort} stores to sort`}
          <span className="sort-banner-go" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      {toCheck > 0 && (
        <button type="button" className="check-card" onClick={() => onFocus({type: 'check'})}>
          <span className="check-count">{toCheck}</span>
          <span className="check-text">
            <strong>{toCheck === 1 ? 'A payment to check' : 'Payments to check'}</strong>
            <span>Tillroll guessed their category</span>
          </span>
          <span className="sort-banner-go" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      <LatestPayments
        rows={rows}
        categories={categories}
        onCategorize={onCategorize}
        onCreateCategory={onCreateCategory}
        showBanks={showBanks}
        labelNames={labelNames}
        onLabels={onLabels}
        onFocusLabel={label => onFocus({type: 'label', key: label})}
        onOpenStore={onOpenStore}
        onSeeAll={onSeeAllPayments}
      />
      <section className="card period-card">
        <header className="card-head">
          <h2>
            {report.chartGrain === 'week'
              ? 'Week by week'
              : report.chartGrain === 'year'
                ? 'Year by year'
                : 'Month by month'}
          </h2>
        </header>
        <PeriodChart
          series={report.series}
          selected={grain === 'all' ? '' : period}
          grain={report.chartGrain}
          currency={currency}
          usual={report.usual}
          onSelect={onSelectPeriod}
        />
      </section>
      <div className="columns">
        <CategoryBreakdown
          {...breakdown}
          preview={{limit: 5, onSeeAll: () => onShow('categories')}}
          onEdit={onEditCategories}
        />
        <StoreBreakdown
          {...breakdown}
          preview={{limit: 5, onSeeAll: () => onShow('stores')}}
          onEdit={onEditStores}
          onOpenStore={onOpenStore}
        />
      </div>
      <BudgetCard
        report={report}
        grain={grain}
        categories={categories}
        budgets={budgets}
        currency={currency}
        onEdit={() => onShow('categories')}
      />
      <MoneyFlow report={report} grain={grain} currency={currency} />
      <FixedSplit report={report} grain={grain} currency={currency} />
      <RegularPayments subscriptions={report.subscriptions} currency={currency} onOpenStore={onOpenStore} />
      <Insights insights={report.insights} />
    </>
  );
}
