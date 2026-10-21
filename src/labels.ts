/** A label as typed, tidied: single spaces, 40 characters at most. */
export const tidyLabel = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 40);

/** The list with the label added once, whatever its capitals. */
export function withLabel(list: string[], label: string) {
  return list.some(item => item.toLowerCase() === label.toLowerCase()) ? list : [...list, label];
}

/** The list without the label, whatever its capitals. */
export function withoutLabel(list: string[], label: string) {
  return list.filter(item => item.toLowerCase() !== label.toLowerCase());
}
