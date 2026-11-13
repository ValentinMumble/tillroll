import {useRef} from 'react';

interface Props {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
  className?: string;
  /** Also a BPCE Vie assurance vie statement (a PDF), once there is data for it to join. */
  withPdf?: boolean;
}

/** A button that opens the file picker for a statement: a bank's (CSV or Excel), or an assurance vie's (PDF). */
export function ImportButton({label, busy, onFile, className = 'button', withPdf = false}: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Reading…' : label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={`.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet${
          withPdf ? ',.pdf,application/pdf' : ''
        }`}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}
