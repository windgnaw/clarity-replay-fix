// Runs in the page's own JavaScript world at document_start on clarity.microsoft.com,
// before the Clarity player loads. It never runs on any other site.
//
// Why: the Clarity replay renderer (clarity-visualize, layout.ts `mask()`) calls
// window.getComputedStyle() on every inserted DIV/SPAN/P/... node to look for background
// images inside masked regions. Each call forces a full style recalculation of the replay
// document, so building a large page (20k+ elements, heavy CSS) slows down quadratically
// and the tab freezes ("Page Unresponsive").
//
// Fix: for elements that live in the replay document (not Clarity's own UI) and are NOT
// inside a [data-clarity-mask] region, return an empty style object. mask() then sees
// "no background image" and skips its work. Masked regions still get the real value.
//
// Pause: the toolbar button can pause the fix for the current tab only. The flag lives in
// this tab's sessionStorage, so it survives reloads in the same tab and disappears when the
// tab is closed.
(() => {
  if (window.__clarityReplayFix) return;

  const PAUSE_KEY = '__clarityReplayFixPaused';
  let paused = false;
  try { paused = sessionStorage.getItem(PAUSE_KEY) === '1'; } catch (e) { /* storage blocked */ }

  const stats = { skipped: 0, passed: 0 };

  if (!paused) {
    const original = window.getComputedStyle;
    const empty = Object.freeze({
      backgroundImage: 'none',
      background: '',
      getPropertyValue: () => ''
    });

    window.getComputedStyle = function (element, pseudo) {
      if (element && element.ownerDocument && element.ownerDocument !== document &&
          !(element.closest && element.closest('[data-clarity-mask]'))) {
        stats.skipped++;
        return empty;
      }
      stats.passed++;
      return original.call(window, element, pseudo);
    };
  }

  Object.defineProperty(window, '__clarityReplayFix', {
    value: Object.freeze({ version: '1.1.0', active: !paused, stats }),
    enumerable: false
  });
})();
