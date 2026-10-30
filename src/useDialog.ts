import {type KeyboardEvent, useEffect, useRef} from 'react';

/**
 * A modal dialog, open as soon as it shows. Escape closes it from anywhere inside, even from a search field (Safari
 * keeps the key for one); a field that uses Escape itself (cancelling a rename) calls preventDefault to keep it open.
 * A click outside it, on the dimmed page, closes it too.
 */
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // Opening focuses the first control. A field to type in keeps it, but not on a touch screen (it would pop the
    // keyboard), and a link or a button does not (it would wear a focus ring for nothing): the dialog takes it.
    const field = document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
    if (!field || window.matchMedia('(pointer: coarse)').matches) {
      dialog.tabIndex = -1;
      dialog.focus();
    }
    // The backdrop's clicks go to the dialog itself, and so do its padding's: only one outside its box closes it, and
    // only when the press began outside too (text selected inside and let go outside keeps it open).
    const outside = (event: MouseEvent) => {
      const box = dialog.getBoundingClientRect();
      return (
        event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
      );
    };
    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = event.target === dialog && outside(event);
    };
    const onClick = (event: MouseEvent) => {
      if (pressedOutside && event.target === dialog && outside(event)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    ref.current?.close();
  }

  return {ref, onKeyDown, close: () => ref.current?.close()};
}
