import {type PointerEvent, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import type {CategoryKey} from '../types';
import {ChartTip} from './ChartTip';

interface Props {
  /** Money in that is no refund nor a move between one's own accounts, and the pay in it. */
  moneyIn: number;
  pay: number;
  /** What the period spent, by category. */
  spent: Map<CategoryKey, number>;
  /** What it put in savings accounts, less what it took back: negative when it took back more. */
  toSavings: number;
  currency: string;
  categories: Categories;
}

interface Part {
  key: string;
  label: string;
  icon: string;
  value: number;
  /** A category's colour, or one of the chart's own (pay, money in, savings, what is left, grey). */
  category: CategoryKey | null;
  tone: 'pay' | 'in' | 'save' | 'left' | 'grey' | null;
}

/** The categories shown on their own; the rest, and any under 3% of the spending, go into "Other spending". */
const TOP = 6;
const SMALL = 0.03;
/** Between two parts of a side, in pixels. */
const GAP = 6;
/** The least room a label takes, in pixels: one line of 12px text. */
const LABEL = 20;

/** Each label's middle, as near its part's middle as the labels above it allow, all inside the chart. */
function spread(middles: number[], height: number) {
  const placed = middles.map(middle => Math.max(middle, LABEL / 2));
  for (let index = 1; index < placed.length; index += 1) {
    placed[index] = Math.max(placed[index], placed[index - 1] + LABEL);
  }
  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const limit = index === placed.length - 1 ? height - LABEL / 2 : placed[index + 1] - LABEL;
    placed[index] = Math.min(placed[index], limit);
  }
  return placed;
}

/**
 * Where the period's money went: what came in on the left (pay, other money in, and what was taken from savings or
 * from the balance when it was not enough), into one pool, then out on the right to each category, to savings, and
 * what was left. Each band is as thick as its amount; a part's tooltip gives its share.
 */
export function FlowChart({moneyIn, pay, spent, toSavings, currency, categories}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const spending = [...spent].filter(([, value]) => value >= 0.5).sort((first, second) => second[1] - first[1]);
  const totalSpent = spending.reduce((sum, [, value]) => sum + value, 0);
  const shown = spending.filter(([, value], index) => index < TOP && value >= totalSpent * SMALL);
  const rest = totalSpent - shown.reduce((sum, [, value]) => sum + value, 0);
  const saved = Math.max(0, toSavings);
  const outs: Part[] = [
    ...shown.map(([key, value]) => ({
      key,
      label: categories.byKey[key]?.label ?? key,
      icon: categories.byKey[key]?.icon ?? '',
      value,
      category: key,
      tone: null,
    })),
    ...(rest >= 0.5
      ? [{key: 'other', label: 'Other spending', icon: '', value: rest, category: null, tone: 'grey' as const}]
      : []),
    ...(saved >= 0.5
      ? [{key: 'saved', label: 'To savings', icon: '', value: saved, category: null, tone: 'save' as const}]
      : []),
  ];
  const ins: Part[] = [
    ...(pay >= 0.5 ? [{key: 'pay', label: 'Pay', icon: '', value: pay, category: null, tone: 'pay' as const}] : []),
    ...(moneyIn - pay >= 0.5
      ? [{key: 'in', label: 'Other money in', icon: '', value: moneyIn - pay, category: null, tone: 'in' as const}]
      : []),
    ...(toSavings <= -0.5
      ? [
          {
            key: 'from-savings',
            label: 'From savings',
            icon: '',
            value: -toSavings,
            category: null,
            tone: 'grey' as const,
          },
        ]
      : []),
  ];
  const inTotal = ins.reduce((sum, part) => sum + part.value, 0);
  const outTotal = outs.reduce((sum, part) => sum + part.value, 0);
  // What came in and went nowhere was kept; what went out beyond it came from the balance.
  if (inTotal - outTotal >= 0.5) {
    outs.push({key: 'left', label: 'Left over', icon: '', value: inTotal - outTotal, category: null, tone: 'left'});
  } else if (outTotal - inTotal >= 0.5) {
    ins.push({
      key: 'balance',
      label: 'From your balance',
      icon: '',
      value: outTotal - inTotal,
      category: null,
      tone: 'grey',
    });
  }
  const total = Math.max(inTotal, outTotal);
  if (total < 1 || ins.length === 0 || outs.length === 0) return null;
  const count = Math.max(ins.length, outs.length);
  const height = Math.max(140, LABEL * count + GAP);
  const scale = (height - GAP * (count - 1)) / total;
  // Each side stacked from its middle down, with the gaps; the pool in the middle holds it all, each part's band
  // meeting it at its own place (`pool`), with no gap.
  const poolTop = (height - total * scale) / 2;
  const stack = (parts: Part[]) => {
    const sideHeight = parts.reduce((sum, part) => sum + part.value * scale, 0) + GAP * (parts.length - 1);
    let top = (height - sideHeight) / 2;
    let pool = poolTop;
    return parts.map(part => {
      const box = {part, top, pool, size: part.value * scale};
      top += box.size + GAP;
      pool += box.size;
      return box;
    });
  };
  const left = stack(ins);
  const right = stack(outs);
  // Bands in the SVG's own units: 100 wide, as tall as the chart; the bars at either end and in the middle.
  const band = (fromX: number, fromY: number, toX: number, toY: number, size: number) => {
    const middle = (fromX + toX) / 2;
    return `M${fromX},${fromY} C${middle},${fromY} ${middle},${toY} ${toX},${toY} L${toX},${toY + size} C${middle},${toY + size} ${middle},${fromY + size} ${fromX},${fromY + size} Z`;
  };
  const leftLabels = spread(
    left.map(box => box.top + box.size / 2),
    height,
  );
  const rightLabels = spread(
    right.map(box => box.top + box.size / 2),
    height,
  );
  const style = (part: Part) => (part.category ? colourStyle(categories.colours[part.category]) : undefined);
  const toneClass = (part: Part) =>
    `sankey-part${part.tone ? ` is-${part.tone}` : ''}${hovered === part.key ? ' is-hovered' : ''}`;
  const tipped = [...left, ...right].find(box => box.part.key === hovered);
  const share = (part: Part) =>
    ins.includes(part)
      ? `${Math.round((part.value / inTotal) * 100)}% of what came in`
      : part.category || part.key === 'other'
        ? `${Math.round((part.value / totalSpent) * 100)}% of the spending`
        : inTotal >= 0.5
          ? `${Math.round((part.value / inTotal) * 100)}% of what came in`
          : '';
  const hover = (key: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setHovered(key);
    },
    // A tap shows it on a phone, and hides it again.
    onClick: () => setHovered(current => (current === key ? null : key)),
  });
  const label = (box: {part: Part}, middle: number, side: 'in' | 'out') => (
    <span
      key={box.part.key}
      className={`sankey-label is-${side}${hovered === box.part.key ? ' is-hovered' : ''}`}
      style={{top: `${middle}px`}}
      {...hover(box.part.key)}
    >
      <span className="sankey-name">
        {box.part.icon && <span aria-hidden="true">{box.part.icon} </span>}
        {box.part.label}
      </span>
      <span className="sankey-value">{money(box.part.value, currency)}</span>
    </span>
  );
  return (
    <figure className="sankey" onPointerLeave={() => setHovered(null)}>
      <figcaption>Where it went</figcaption>
      <div className="sankey-body" style={{height: `${height}px`}}>
        <div className="sankey-labels is-in">{left.map((box, index) => label(box, leftLabels[index], 'in'))}</div>
        <svg
          className="sankey-svg"
          // Its own height: a stretched SVG with none takes its view box's shape, far taller than the chart.
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${ins.map(part => `${part.label} ${money(part.value, currency)}`).join(', ')} went to ${outs
            .map(part => `${part.label} ${money(part.value, currency)}`)
            .join(', ')}`}
        >
          {left.map(box => (
            <g key={box.part.key} className={toneClass(box.part)} style={style(box.part)} {...hover(box.part.key)}>
              <path className="sankey-band" d={band(4, box.top, 48, box.pool, box.size)} />
              <rect className="sankey-node" x={0} y={box.top} width={4} height={box.size} />
            </g>
          ))}
          <rect className="sankey-pool" x={48} y={poolTop} width={4} height={total * scale} />
          {right.map(box => (
            <g key={box.part.key} className={toneClass(box.part)} style={style(box.part)} {...hover(box.part.key)}>
              <path className="sankey-band" d={band(52, box.pool, 96, box.top, box.size)} />
              <rect className="sankey-node" x={96} y={box.top} width={4} height={box.size} />
            </g>
          ))}
        </svg>
        <div className="sankey-labels is-out">{right.map((box, index) => label(box, rightLabels[index], 'out'))}</div>
        {tipped && (
          <ChartTip edge={ins.includes(tipped.part) ? 'start' : 'end'} bottom={`${height - tipped.top + 8}px`}>
            <strong>
              {tipped.part.icon} {tipped.part.label}
            </strong>
            <span>{money(tipped.part.value, currency)}</span>
            {share(tipped.part) && <span>{share(tipped.part)}</span>}
          </ChartTip>
        )}
      </div>
    </figure>
  );
}
