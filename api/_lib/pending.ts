import type {Transaction} from '../../src/types';

/** A pending payment and the payment the bank books for it are this many days apart at most. */
export const BOOKING_DAYS = 10;

/** A booked amount from half to twice the pending one: a hold (parking, a hotel), a tip, a currency conversion. */
const HOLD_RATIO = 0.5;

const days = (first: string, second: string) => Math.abs(Date.parse(first) - Date.parse(second)) / 86_400_000;

/** A store's name as the bank writes it, for comparing: lower case, letters and digits only. */
const merchant = (description: string) =>
  description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * The payment that took each pending one's place, by id: of the same currency, a few days apart at most, never two
 * pending ones on the same. The same amount first (the nearest day wins); else the same store for an amount from half
 * to twice it, as a hold or a tip leaves it (the nearest amount wins). The account is not compared: Enable Banking's
 * account hashes all start alike, so a transaction id's account part is the same for every account.
 */
export function matchBooked(gone: Transaction[], candidates: Transaction[]) {
  const left = [...candidates];
  const matches = new Map<string, Transaction>();
  const near = (old: Transaction) =>
    left.filter(item => item.currency === old.currency && days(item.date, old.date) <= BOOKING_DAYS);
  const take = (old: Transaction, next: Transaction | undefined) => {
    if (!next) return false;
    left.splice(left.indexOf(next), 1);
    matches.set(old.id, next);
    return true;
  };
  // Exact amounts first, for every pending one, so a hold never takes the payment another matched to the cent.
  const unmatched = gone.filter(
    old =>
      !take(
        old,
        near(old)
          .filter(item => item.amount === old.amount)
          .sort((first, second) => days(first.date, old.date) - days(second.date, old.date))[0],
      ),
  );
  for (const old of unmatched) {
    const store = merchant(old.description);
    if (!store) continue;
    take(
      old,
      near(old)
        .filter(item => {
          if (merchant(item.description) !== store || Math.sign(item.amount) !== Math.sign(old.amount)) return false;
          const [small, large] = [Math.abs(item.amount), Math.abs(old.amount)].sort((first, second) => first - second);
          return large > 0 && small / large >= HOLD_RATIO;
        })
        .sort(
          (first, second) =>
            Math.abs(first.amount - old.amount) - Math.abs(second.amount - old.amount) ||
            days(first.date, old.date) - days(second.date, old.date),
        )[0],
    );
  }
  return matches;
}
