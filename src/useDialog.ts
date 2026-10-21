import { type KeyboardEvent, useEffect, useRef } from 'react'

/**
 * A modal dialog, open as soon as it shows. Escape closes it from anywhere inside, even from a search field (Safari
 * keeps the key for one); a field that uses Escape itself (cancelling a rename) calls preventDefault to keep it open.
 */
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    ref.current?.close()
  }

  return { ref, onKeyDown, close: () => ref.current?.close() }
}
