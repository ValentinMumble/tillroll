import {type KeyboardEvent, useEffect, useRef} from 'react';

/** Where dialogs are sheets from the bottom (the phone rules in shell.css). */
const SHEET = '(max-width: 560px)';
/** How far down from a sheet's top edge a drag can start, and how far it must go to close the sheet. */
const SHEET_HANDLE = 64;
const SHEET_CLOSE = 100;

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
    // On a phone the dialog is a sheet from the bottom: dragged down by its top (the grabber and the title), it follows
    // the finger, and let go far enough it slides away and closes.
    let startY: number | null = null;
    let drag = 0;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!window.matchMedia(SHEET).matches || event.touches.length !== 1 || dialog.scrollTop > 0) return;
      if (touch.clientY - dialog.getBoundingClientRect().top > SHEET_HANDLE) return;
      startY = touch.clientY;
      dialog.style.transition = 'none';
    };
    const onTouchMove = (event: TouchEvent) => {
      if (startY === null) return;
      drag = Math.max(0, event.touches[0].clientY - startY);
      dialog.style.translate = `0 ${drag}px`;
    };
    const onTouchEnd = () => {
      if (startY === null) return;
      startY = null;
      dialog.style.transition = 'translate 0.25s ease-out';
      if (drag > SHEET_CLOSE) {
        dialog.style.translate = '0 100%';
        window.setTimeout(() => dialog.close(), 200);
      } else dialog.style.translate = '';
      drag = 0;
    };
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('touchstart', onTouchStart, {passive: true});
    dialog.addEventListener('touchmove', onTouchMove, {passive: true});
    dialog.addEventListener('touchend', onTouchEnd);
    dialog.addEventListener('touchcancel', onTouchEnd);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('touchstart', onTouchStart);
      dialog.removeEventListener('touchmove', onTouchMove);
      dialog.removeEventListener('touchend', onTouchEnd);
      dialog.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    ref.current?.close();
  }

  return {ref, onKeyDown, close: () => ref.current?.close()};
}
