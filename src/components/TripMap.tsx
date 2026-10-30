import {useEffect, useMemo, useRef} from 'react';
import {money} from '../format';
import {daysLabel, type TripSummary} from '../trips';

interface Props {
  trips: TripSummary[];
  currency: string;
  /** Shows a trip's payments, from its bubble. */
  onOpen: (label: string) => void;
}

const escape = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

/**
 * The trips with a place on a map (Leaflet, with Esri's light or dark grey tiles to match the page): one violet bubble a
 * trip, its area as big as what it cost against the biggest. A bubble's tooltip says the trip, its days and cost; a
 * tap or a click shows its payments. It opens on the trips in and around Europe; zooming out shows the farther ones.
 * Leaflet loads only when there is a trip to show.
 */
export function TripMap({trips, currency, onOpen}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  // The latest onOpen, for the bubbles' clicks, without making the map again when it changes.
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  });
  const placed = useMemo(() => trips.filter(trip => trip.place), [trips]);
  useEffect(() => {
    const element = holder.current;
    if (!element || placed.length === 0) return;
    let cancelled = false;
    let remove = () => {};
    const draw = async () => {
      const {default: L} = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled) return;
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const map = L.map(element, {scrollWheelZoom: false, worldCopyJump: true});
      remove = () => map.remove();
      // Esri's grey canvas, as in Statva: no key needed (CARTO's tiles now want one).
      L.tileLayer(
        `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${
          dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'
        }/MapServer/tile/{z}/{y}/{x}`,
        {attribution: 'Tiles © Esri, DeLorme, NAVTEQ', maxZoom: 16},
      ).addTo(map);
      const top = Math.max(...placed.map(trip => trip.total));
      // The biggest first, so the small ones sit on top and stay easy to reach.
      for (const trip of [...placed].sort((first, second) => second.total - first.total)) {
        const place = trip.place!;
        const marker = L.circleMarker([place.lat, place.lon], {
          radius: 6 + 18 * Math.sqrt(trip.total / top),
          className: 'trip-marker',
        });
        marker.bindTooltip(
          `<strong>${escape(trip.name)}</strong><span>${escape(place.name)}</span><span>${escape(
            daysLabel(trip.from, trip.to),
          )}</span><span>${escape(money(trip.total, currency))}</span>`,
          {direction: 'top', className: 'trip-map-tip', offset: [0, -4]},
        );
        marker.on('click', () => open.current(trip.name));
        marker.addTo(map);
      }
      // In and around Europe first, when two trips or more are there: the rest of the world is a zoom out away.
      const near = placed.filter(trip => trip.place!.lon > -30 && trip.place!.lon < 45);
      const framed = near.length >= 2 ? near : placed;
      map.fitBounds(L.latLngBounds(framed.map(trip => [trip.place!.lat, trip.place!.lon])), {
        padding: [28, 28],
        maxZoom: 6,
      });
    };
    // A map that cannot load (no network, a stale dev cache) leaves the space empty: say why in the console.
    draw().catch((error: unknown) => console.error('The trips map could not load', error));
    return () => {
      cancelled = true;
      remove();
    };
  }, [placed, currency]);
  if (placed.length === 0) return null;
  return (
    <figure className="trip-map">
      <figcaption>Where you went</figcaption>
      <div
        ref={holder}
        className="trip-map-canvas"
        role="img"
        aria-label={`Trips on a map: ${placed.map(trip => `${trip.name}, ${trip.place!.name}`).join('; ')}`}
      />
      {placed.length < trips.length && (
        <p className="hint">
          {trips.length - placed.length} trip{trips.length - placed.length === 1 ? ' has' : 's have'} no place yet: add
          one in the trip&rsquo;s dialog (its name, below).
        </p>
      )}
    </figure>
  );
}
