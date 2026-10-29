import type {Categories} from './categories';
import {money} from './format';
import type {Row} from './rows';
import type {Fact} from './stats';

function plural(count: number, word: string) {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * A tile for each category marked as a hobby (rows of one currency, all time), the costliest first: what it really
 * cost once refunds, paybacks and things sold on are taken off, what came back, since when, the biggest purchase and
 * the label bought most under it. Then all hobbies together, against all the spending. None with no hobby marked.
 */
export function hobbyStats(rows: Row[], currency: string, categories: Categories): Fact[] {
  const hobbies = categories.list.filter(category => category.hobby && category.spending);
  if (hobbies.length === 0) return [];
  const amount = (value: number) => money(value, currency);
  const tiles = hobbies.flatMap(category => {
    const list = rows.filter(row => row.category === category.key && row.counts);
    const bought = list.filter(row => row.amount < 0);
    if (bought.length === 0) return [];
    const spent = bought.reduce((sum, row) => sum - row.amount, 0);
    const cost = list.reduce((sum, row) => sum + row.spend, 0);
    const first = bought.reduce((oldest, row) => (row.date < oldest ? row.date : oldest), bought[0].date);
    const biggest = bought.reduce((top, row) => (row.amount < top.amount ? row : top), bought[0]);
    const labels = new Map<string, number>();
    for (const row of bought) for (const label of row.labels) labels.set(label, (labels.get(label) ?? 0) + 1);
    const [favourite, times] = [...labels].sort((first, second) => second[1] - first[1])[0] ?? [];
    const details = [
      `${plural(bought.length, 'purchase')} since ${first.slice(0, 4)}`,
      spent - cost >= 1 ? `${amount(spent - cost)} back from resales and refunds` : '',
      `the biggest ${biggest.labels[0] ?? biggest.store} (${amount(-biggest.amount)})`,
      favourite && times > 1 ? `most bought: #${favourite} (${times})` : '',
    ];
    return [
      {
        cost,
        fact: {
          icon: category.icon,
          value: amount(cost),
          title: category.label,
          detail: details.filter(Boolean).join('; '),
        },
      },
    ];
  });
  if (tiles.length === 0) return [];
  const together = tiles.reduce((sum, tile) => sum + tile.cost, 0);
  const all = rows.filter(row => row.counts).reduce((sum, row) => sum + row.spend, 0);
  return [
    {
      icon: '🎨',
      value: amount(together),
      title: 'All hobbies',
      detail: `${tiles.length} ${tiles.length === 1 ? 'hobby' : 'hobbies'}, ${Math.round((together / Math.max(1, all)) * 100)}% of all the spending`,
    },
    ...tiles.sort((first, second) => second.cost - first.cost).map(tile => tile.fact),
  ];
}
