import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/lib/legacy-controller.js', import.meta.url), 'utf8');

// Exercise the actual focus event handler with the PaneForge imperative API.
function paneHarness(initialSize) {
  let size = initialSize;
  let expandedSize = initialSize;
  const classes = new Set();
  const context = vm.createContext({
    previousPaneSize: null, syncingFromResize: false,
    switchingByDivider: false, draggingDivider: false, trackFocusThreshold: 80,
    document: { body: { classList: {
      contains: name => classes.has(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
    } } },
    requestAnimationFrame: callback => callback(),
    timelinePane: {
      getSize: () => size,
      isCollapsed: () => size === 7,
      collapse: () => { if (size !== 7) expandedSize = size; size = 7; },
      expand: () => { if (size === 7) size = expandedSize; },
      resize: value => { size = value; }
    }
  });
  const start = page.indexOf('    const syncFocus = (event) => {');
  const end = page.indexOf('    let resizePointer', start);
  vm.runInContext(page.slice(start, end) + '\nglobalThis.syncFocus = syncFocus;', context);
  return {
    size: () => size,
    focus: (paneAction, focused = paneAction === 'render') => {
      context.document.body.classList.toggle('render-focus', focused);
      context.syncFocus({ detail: { paneAction, focused } });
    }
  };
}

for (const initialSize of [7, 28, 53, 100]) {
  test(`focus actions restore the original ${initialSize}% split across repeated switches`, () => {
    const pane = paneHarness(initialSize);
    pane.focus('timeline');
    assert.equal(pane.size(), 100);
    pane.focus('timeline');
    pane.focus('render');
    assert.equal(pane.size(), 7);
    pane.focus('timeline');
    assert.equal(pane.size(), 100);
    pane.focus('restore', initialSize <= 16);
    assert.equal(pane.size(), initialSize);
    pane.focus('render');
    assert.equal(pane.size(), 7);
    pane.focus('restore', initialSize <= 16);
    assert.equal(pane.size(), initialSize);
  });
}

test('ordinary timeline toggle still collapses and expands the PaneForge pane', () => {
  const pane = paneHarness(42);
  pane.focus(undefined, true);
  assert.equal(pane.size(), 7);
  pane.focus(undefined, false);
  assert.equal(pane.size(), 42);
});

test('all focus aliases reach the pane actions and timeline has no CSS focus override', () => {
  const definitions = controller.slice(controller.indexOf("      'fullscreen render':"), controller.indexOf("      play: { aliases:"));
  const calls = [];
  const registry = vm.runInNewContext('({' + definitions + '})', { viewFocus: kind => calls.push(kind) });
  for (const [name, kind] of [['fullscreen render', 'render'], ['focus timeline', 'timeline'], ['exit fullscreen', null]]) {
    registry[name].run();
    assert.equal(calls.at(-1), kind);
  }
  assert.deepEqual(Array.from(registry['fullscreen render'].aliases), ['fullscreen', 'focus render', 'render fullscreen']);
  assert.deepEqual(Array.from(registry['focus timeline'].aliases), ['fullscreen timeline', 'timeline fullscreen']);
  assert.ok(registry['exit fullscreen'].aliases.includes('unfocus'));
  const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /action-focus-timeline/);
});
