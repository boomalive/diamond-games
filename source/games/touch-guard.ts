// Nested game frames must own the gesture, including in mobile Safari where
// touch-action alone can still allow an ancestor page to pan.
export function preventPageGestures(surface: HTMLElement) {
  const prevent = (event: TouchEvent) => {
    if (event.cancelable) event.preventDefault();
  };
  surface.addEventListener('touchstart', prevent, {passive: false});
  surface.addEventListener('touchmove', prevent, {passive: false});
}
