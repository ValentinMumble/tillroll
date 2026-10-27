import {describe, expect, it} from 'vitest';
import {storeKey, storeName} from './stores';

describe('storeName', () => {
  it.each([
    // A payment app's prefix gives way to the shop behind it, with a star or a space.
    ['SUMUP *CAFE DU COIN 75011', 'Cafe Du Coin'],
    ['Hpy*fnac Photo Fr', 'Fnac Photo Fr'],
    ['Hpy*zoomalia.com', 'Zoomalia'],
    ['HPY Woodbrass', 'Woodbrass'],
    ['Mgp*leetchi Sa', 'Leetchi Sa'],
    ['Cm *pllek Ndsm', 'Pllek Ndsm'],
    ['Lemsqzy* Onlabs', 'Onlabs'],
    ['Ppg Flashrc', 'Flashrc'],
    // Brands whose text varies a lot are one store.
    ['Mgp*vinted 0402593', 'Vinted'],
    ['MGP Vinted - Kleiderkreisel', 'Vinted'],
    ['UBER *EATS', 'Uber Eats'],
    // A shop's own star keeps its name, without what follows.
    ['Superprof* Pass Eleve', 'Superprof'],
    // A French card payment: the card prefix and the deferred debit's suffix go.
    ['CB CAFE POP FACT 270826 378902******7', 'Cafe Pop'],
  ])('%s is %s', (description, name) => {
    expect(storeName(description)).toBe(name);
  });
});

describe('storeKey', () => {
  it('is lower case without accents', () => {
    expect(storeKey('Crédit Coopératif')).toBe('credit cooperatif');
  });
});
