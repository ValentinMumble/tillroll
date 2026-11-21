import {describe, expect, it} from 'vitest';
import {hasWords} from './text';

describe('hasWords', () => {
  it('finds the words in any order, whatever their case and accents', () => {
    expect(hasWords('Nantes ⇄ Lorient', 'lorient Nantes')).toBe(true);
    expect(hasWords('Nantes ⇄ Lorient', 'nantes lorient')).toBe(true);
    expect(hasWords('Crédit Mutuel', 'mutuel cred')).toBe(true);
  });

  it('needs every word', () => {
    expect(hasWords('Nantes ⇄ Lorient', 'nantes paris')).toBe(false);
  });

  it('finds anything for nothing typed', () => {
    expect(hasWords('Nantes ⇄ Lorient', '')).toBe(true);
  });
});
