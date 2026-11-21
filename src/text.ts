/** Text to compare loosely: lower case, without accents ("Crédit" matches "credit"). Searches and store keys use it. */
export function plain(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Whether a text holds every word of what is typed, in any order ("lorient nantes" finds "Nantes ⇄ Lorient"). */
export function hasWords(text: string, typed: string) {
  const loose = plain(text);
  return plain(typed)
    .split(/\s+/)
    .every(word => loose.includes(word));
}

/** "1 payment", "3 payments". */
export const paymentCount = (count: number) => (count === 1 ? '1 payment' : `${count} payments`);
