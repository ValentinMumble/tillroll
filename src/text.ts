/** Text to compare loosely: lower case, without accents ("Crédit" matches "credit"). Searches and store keys use it. */
export function plain(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "1 payment", "3 payments". */
export const paymentCount = (count: number) => (count === 1 ? '1 payment' : `${count} payments`);
