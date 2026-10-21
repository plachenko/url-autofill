import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionRegistry, parseTime, splitCommands } from '../src/lib/url-actions.js';

test('parseTime accepts hh:mm:ss, mm:ss and seconds', () => {
  assert.equal(parseTime('00:01:30'), 90);
  assert.equal(parseTime('1:30'), 90);
  assert.equal(parseTime('90'), 90);
  assert.equal(parseTime('2.5s'), 2.5);
  assert.equal(parseTime('1:75'), null);
  assert.equal(parseTime('soon'), null);
});

test('splitCommands keeps commas between digits', () => {
  assert.deepEqual(splitCommands('speak,focus-timeline'), ['speak', 'focus-timeline']);
  assert.deepEqual(splitCommands('seek 1,5; play'), ['seek 1,5', 'play']);
});

test('registry normalizes phrases, aliases and args', () => {
  const calls = [];
  const registry = createActionRegistry({
    'fullscreen render': { aliases: ['fullscreen', 'focus render'], run: () => calls.push('fs') },
    'focus timeline': { aliases: ['fullscreen timeline'], run: () => calls.push('tl') },
    seek: { aliases: ['skip'], run: args => calls.push(['seek', parseTime(args)]) },
    play: () => calls.push('play')
  });
  const unknown = [];
  registry.run('Fullscreen;focus%20timeline'.replace('%20', ' '));
  registry.run('skip to 00:01:30, seek:1:30 ; seek=90,FOCUS-TIMELINE,dance', input => unknown.push(input));
  registry.run('render-fullscreen'.replace('render-fullscreen', 'focus-render'));
  assert.deepEqual(calls, ['fs', 'tl', ['seek', 90], ['seek', 90], ['seek', 90], 'tl', 'fs']);
  assert.deepEqual(unknown, ['dance']);
});


test('registry parses move commands and aliases with normalized arguments', () => {
  const registry = createActionRegistry({
    move: { aliases: ['place', 'position'], run: () => {} }
  });
  for (const [input, args] of [
    ['move clip2 to 5', 'clip2 5'],
    ['move=clip2,5', 'clip2,5'],
    ['move:clip2 5', 'clip2 5'],
    ['move clip2 to 5 track 2', 'clip2 5 track 2'],
    ['place CLIP2 to 5', 'clip2 5'],
    ['position Clip-One_two+3 to 5', 'clip one two 3 5']
  ]) {
    assert.deepEqual(registry.parse(input), [{ name: 'move', args }]);
  }
});
