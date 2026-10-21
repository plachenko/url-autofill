import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createActionRegistry } from '../src/lib/url-actions.js';

const page = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/lib/legacy-controller.js', import.meta.url), 'utf8');

// Exercise the actual focus event handler with the PaneForge imperative API.
function paneHarness(initialSize) {
  let size = initialSize;
  let expandedSize = initialSize;
  const classes = new Set();
  const context = vm.createContext({
    previousPaneSize: null, syncingFromResize: false, focusThreshold: 16,
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
      const previousFocused = context.document.body.classList.contains('render-focus');
      context.document.body.classList.toggle('render-focus', focused);
      context.syncFocus({ detail: { paneAction, focused, previousFocused } });
    }
  };
}

for (const initialSize of [7, 28, 53, 100]) {
  test(`focus actions restore a non-focused ${initialSize}% split across repeated switches`, () => {
    const pane = paneHarness(initialSize);
    pane.focus('timeline');
    assert.equal(pane.size(), 100);
    pane.focus('timeline');
    pane.focus('render');
    assert.equal(pane.size(), 7);
    pane.focus('timeline');
    assert.equal(pane.size(), 100);
    pane.focus('restore', false);
    assert.equal(pane.size(), initialSize > 16 && initialSize < 99 ? initialSize : 28);
    pane.focus('render');
    assert.equal(pane.size(), 7);
    pane.focus('restore', false);
    assert.equal(pane.size(), initialSize > 16 && initialSize < 99 ? initialSize : 28);
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

test('restore forces a fresh collapsed or timeline-focused pane open', () => {
  for (const size of [7, 16, 28, 99, 100]) {
    const pane = paneHarness(size);
    pane.focus('restore', false);
    assert.equal(pane.size(), 28);
  }
});

function controllerHarness(initialFocus = false, timelineFocus = false) {
  const classes = new Set(initialFocus ? ['render-focus'] : []);
  if (timelineFocus) classes.add('timeline-pip');
  const storage = new Map();
  const notices = [];
  let exits = 0;
  const context = vm.createContext({
    renderFocus: initialFocus, focusStorageKey: 'urlAutofill.renderFocus.v1',
    document: { body: { classList: {
      contains: name => classes.has(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
    } }, documentElement: {} },
    timelineToggle: { setAttribute() {} },
    window: { localStorage: { setItem: (key, value) => storage.set(key, value) }, dispatchEvent() {} },
    CustomEvent: class { constructor(name, options) { Object.assign(this, options); } },
    fullscreenElement: () => ({}),
    changeFullscreen: target => { assert.equal(target, null); exits++; },
    requestFullscreen: () => null,
    toast: text => notices.push(text)
  });
  const setter = controller.slice(controller.indexOf('    function setRenderFocus('), controller.indexOf("    timelineToggle.addEventListener"));
  const focus = controller.slice(controller.indexOf('    let pendingFullscreen ='), controller.indexOf('    const tryPendingFullscreen'));
  vm.runInContext(setter + focus, context);
  const definitions = controller.slice(controller.indexOf("      'fullscreen render':"), controller.indexOf("      play: { aliases:"));
  const registry = vm.runInContext('({' + definitions + '})', context);
  return { context, classes, storage, notices, exits: () => exits, registry: createActionRegistry(registry) };
}

test('all unconditional exit aliases clear focus, storage, fullscreen and pending retry', () => {
  for (const input of ['unfocus', 'exit focus', 'exit fullscreen']) {
    for (const focused of [false, true]) {
      const h = controllerHarness(focused);
      vm.runInContext('pendingFullscreen = document.documentElement', h.context);
      h.registry.run(input);
      assert.equal(h.context.renderFocus, false);
      assert.equal(h.classes.has('render-focus'), false);
      assert.equal(h.storage.get('urlAutofill.renderFocus.v1'), '0');
      assert.equal(h.exits(), 1);
      assert.equal(vm.runInContext('pendingFullscreen', h.context), null);
    }
  }
});

test('pane exits use longest names, normalize URL hyphens, and leave other focus alone', () => {
  for (const [pane, alias] of [['render', 'exit render focus'], ['timeline', 'exit timeline focus']]) {
    for (const command of ['unfocus-' + pane, alias]) {
      const inactive = controllerHarness(pane !== 'render', pane !== 'timeline');
      assert.equal(inactive.registry.parse(command)[0].name, 'unfocus ' + pane);
      assert.equal(inactive.registry.parse(command)[0].args, '');
      inactive.registry.run(command);
      assert.deepEqual(inactive.notices, [pane === 'render' ? "Render isn't focused" : "Timeline isn't focused"]);
      assert.equal(inactive.exits(), 0);
      const active = controllerHarness(pane === 'render', pane === 'timeline');
      active.registry.run(command);
      assert.equal(active.exits(), 1);
      assert.equal(active.context.renderFocus, false);
    }
  }
});
