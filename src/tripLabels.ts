import {createContext} from 'react';

/** The labels marked as trips, in lower case: their chips wear the trips' colour wherever a payment shows. */
export const TripLabels = createContext<Set<string>>(new Set());
