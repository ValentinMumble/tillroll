import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * A ⋯ button with a small panel of actions, for the phone header. The panel stays in the page while closed (only
 * hidden), so an action that opens a file picker still gets the file after the panel closes.
 */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="menu" ref={box}>
      <button
        type="button"
        className="menu-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      <div className="menu-panel" hidden={!open} onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  )
}
