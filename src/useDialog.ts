import { type KeyboardEvent, useEffect, useRef } from 'react'

/**
 * A modal dialog, open as soon as it shows. Escape closes it from anywhere inside, even from a search field (Safari
 * keeps the key for one); a field that uses Escape itself (cancelling a rename) calls preventDefault to keep it open.
 */
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    // Opening focuses the first control. A field to type in keeps it, but not on a touch screen (it would pop the
    // keyboard), and a link or a button does not (it would wear a focus ring for nothing): the dialog takes it.
    const field = document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]), select, textarea')
    if (!field || window.matchMedia('(pointer: coarse)').matches) {
      dialog.tabIndex = -1
      dialog.focus()
    }
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    ref.current?.close()
  }

  return { ref, onKeyDown, close: () => ref.current?.close() }
}
