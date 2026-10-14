import assert from 'node:assert/strict';
import test from 'node:test';
import { adoptTeslaTheaterLink, canShowTeslaTheater, isTeslaCarBrowser,
  teslaTheaterPreferenceKey, teslaTheaterTransferParam } from '../src/lib/tesla-browser.js';

test('recognizes Tesla vehicle browser signatures', () => {
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/100.0 Safari/537.36 Tesla/2022.12.3.5'), true);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Safari/537.36 Tesla/feature-2022.20.9-31-abc'), true);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 AppleWebKit/601.1 Tesla QtCarBrowser Safari/601.1'), true);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 AppleWebKit/537.36 Tesla Model 3 Safari/537.36'), true);
});

test('does not show vehicle controls in ordinary or similarly named browsers', () => {
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/120.0 Safari/537.36'), false);
  assert.equal(isTeslaCarBrowser('Mozilla/5.0 Chrome/114.0 TeslaBrowser/114.0'), false);
  assert.equal(isTeslaCarBrowser(''), false);
});

test('allows a Tesla browser with a generic user agent to be enabled on that browser', () => {
  const genericCarAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
  const storage = new Map();
  const preference = { getItem: key => storage.get(key) ?? null };
  assert.equal(canShowTeslaTheater(genericCarAgent, preference), false);
  storage.set(teslaTheaterPreferenceKey, '1');
  assert.equal(canShowTeslaTheater(genericCarAgent, preference), true);
  storage.delete(teslaTheaterPreferenceKey);
  assert.equal(canShowTeslaTheater(genericCarAgent, preference), false);
});

test('carries the Theater preference into its separate storage and removes the URL flag', () => {
  const storage = new Map();
  const browserStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  };
  const link = `https://example.com/app/?m=e&${teslaTheaterTransferParam}=1`;
  const cleanUrl = adoptTeslaTheaterLink(link, browserStorage);
  assert.equal(cleanUrl.href, 'https://example.com/app/?m=e');
  assert.equal(canShowTeslaTheater('Mozilla/5.0 Chrome/148.0.0.0', browserStorage), true);
  assert.equal(adoptTeslaTheaterLink('https://example.com/app/?m=e', browserStorage), null);
});
