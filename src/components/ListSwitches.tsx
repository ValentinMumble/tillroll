import {savePaymentsEverything, savePaymentsOwn} from '../storage';

interface Props {
  moneyIn: boolean;
  own: boolean;
  /** The period's moves between one's own accounts. */
  moves: number;
  onMoneyIn: (on: boolean) => void;
  onOwn: (on: boolean) => void;
}

/**
 * What a payment list shows besides spending: money in and transfers, and the moves between one's own accounts.
 * Both choices are remembered in each browser, for the overview and the payment list alike.
 */
export function ListSwitches({moneyIn, own, moves, onMoneyIn, onOwn}: Props) {
  return (
    <div className="list-switches" role="group" aria-label="Also show">
      <button
        type="button"
        className="chip"
        aria-pressed={moneyIn}
        aria-label="Money in and transfers"
        title="Money in and transfers: pay, a friend paying back, a transfer to someone"
        onClick={() => {
          onMoneyIn(!moneyIn);
          savePaymentsEverything(!moneyIn);
        }}
      >
        <span aria-hidden="true">💶</span>
        <span className="long">Money in</span>
      </button>
      <button
        type="button"
        className="chip"
        aria-pressed={own}
        aria-label={`Between my accounts${moves > 0 ? `, ${moves}` : ''}`}
        title="Between my accounts: savings, pockets, top-ups, another bank of yours. In no total."
        onClick={() => {
          onOwn(!own);
          savePaymentsOwn(!own);
        }}
      >
        <span aria-hidden="true">🔁</span>
        <span className="long">My accounts</span>
        {moves > 0 && <span className="chip-count">{moves}</span>}
      </button>
    </div>
  );
}
