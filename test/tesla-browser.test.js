import assert from 'node:assert/strict';
import test from 'node:test';
import { isTeslaCarBrowser } from '../src/lib/tesla-browser.js';

test('recognizes Tesla vehicle browser signatures', () => {
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/100.0 Safari/537.36 Tesla/2022.12.3.5'), true);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Safari/537.36 Tesla/feature-2022.20.9-31-abc'), true);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 AppleWebKit/601.1 Tesla QtCarBrowser Safari/601.1'), true);
});

test('does not show vehicle controls in ordinary or similarly named browsers', () => {
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/120.0 Safari/537.36'), false);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/114.0 TeslaBrowser/114.0'), false);
  assert.equal(isTeslaCarBrowser(''), false);
});
