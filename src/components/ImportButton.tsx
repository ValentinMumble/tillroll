import { useRef } from 'react'

interface Props {
  label: string
  busy: boolean
  onFile: (file: File) => void
  className?: string
}

/** A button that opens the file picker for a Revolut statement (CSV or Excel). */
export function ImportButton({ label, busy, onFile, className = 'button' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Reading…' : label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </>
  )
}
