/** A small link that looks the store up on Google in a new tab, for a name that says nothing ("P R S", "Sum"). */
export function WebSearch({name}: {name: string}) {
  return (
    <a
      className="web-search"
      href={`https://www.google.com/search?q=${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Search Google for ${name}`}
      title={`Search Google for ${name}`}
      // Inside a row that reacts to clicks and double-clicks: the link only opens the search.
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </svg>
    </a>
  );
}
