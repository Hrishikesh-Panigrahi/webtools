// A draggable divider for the two-pane layouts.
//
// The ratio is written to CSS custom properties rather than straight onto
// `grid-template-columns`, because the narrow-screen rule collapses the grid to
// a single column and an inline template would outrank it.

import { h } from './dom.js';

// The share of the grid each pane keeps, so neither can be dragged shut.
const MIN_RATIO = 0.15;
const DEFAULT_RATIO = 0.5;
const KEYBOARD_STEP = 0.02;

const clampRatio = (ratio) => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio));

const KEYBOARD_RATIOS = {
  Home: () => MIN_RATIO,
  End: () => 1 - MIN_RATIO,
  Enter: () => DEFAULT_RATIO,
  ' ': () => DEFAULT_RATIO,
};

const KEYBOARD_STEPS = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP };

/**
 * Give a two-pane grid a divider the reader can drag.
 *
 * @param {HTMLElement} grid                 an `.io-grid` holding exactly two panes
 * @param {Object} [options]
 * @param {number} [options.ratio]           starting share for the left pane, 0-1
 * @param {(ratio:number)=>void} [options.onChange]  called once a drag settles
 */
export function makeSplittable(grid, { ratio = DEFAULT_RATIO, onChange } = {}) {
  const rightPane = grid.children[1];
  if (!rightPane) return;

  const handle = h('div', {
    class: 'split-handle',
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize panes',
  });

  let current = clampRatio(ratio);
  let dragging = false;

  const paint = () => {
    grid.style.setProperty('--split-left', `${current}fr`);
    grid.style.setProperty('--split-right', `${1 - current}fr`);
    handle.setAttribute('aria-valuenow', String(Math.round(current * 100)));
  };

  const moveTo = (next) => {
    current = clampRatio(next);
    paint();
  };

  const settle = () => onChange?.(current);

  const ratioUnder = (clientX) => {
    const bounds = grid.getBoundingClientRect();
    return (clientX - bounds.left) / bounds.width;
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    grid.classList.add('splitting');
  });

  handle.addEventListener('pointermove', (event) => {
    if (dragging) moveTo(ratioUnder(event.clientX));
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    grid.classList.remove('splitting');
    settle();
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  handle.addEventListener('dblclick', () => { moveTo(DEFAULT_RATIO); settle(); });

  handle.addEventListener('keydown', (event) => {
    const jump = KEYBOARD_RATIOS[event.key];
    const step = KEYBOARD_STEPS[event.key];
    if (!jump && step === undefined) return;
    event.preventDefault();
    moveTo(jump ? jump() : current + step);
    settle();
  });

  grid.classList.add('split');
  grid.insertBefore(handle, rightPane);
  paint();
}
