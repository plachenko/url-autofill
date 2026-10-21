import { mediaStorageKey, storeWholeMedia, validMediaId } from './media-store.js';

export const paletteTemplatesKey = 'urlAutofill.paletteTemplates.v1';
export const paletteDefaults = [
  { kind: 'color', label: 'Color', color: '#4472c4', seconds: 3 },
  { kind: 'text', label: 'Text', text: 'Your text', color: '#ffffff', seconds: 3 },
  { kind: 'empty', label: 'Empty clip', seconds: 3 }
];

export function paletteTemplate(value) {
  const kind = value?.kind;
  if (!['color', 'text', 'empty'].includes(kind)) throw new Error('Choose Color, Text, or Empty clip.');
  const label = String(value.label || kind).trim().slice(0, 48);
  const seconds = Number(value.seconds);
  if (!label || !Number.isFinite(seconds) || seconds < .1 || seconds > 3600)
    throw new Error('Enter a name and a duration from 0.1 to 3600 seconds.');
  const color = String(value.color || '#ffffff');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Choose a valid color.');
  const text = String(value.text || '').trim().slice(0, 200);
  if (kind === 'text' && !text) throw new Error('Enter text for the text object.');
  return { kind, label, color, text, seconds };
}

const xml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function paletteDataUri(value) {
  const item = paletteTemplate(value);
  const text = item.kind === 'empty' ? 'Empty clip · fill from Palette' : item.kind === 'text' ? item.text : '';
  const background = item.kind === 'empty' ? '#263040' : item.kind === 'text' ? '#10151e' : item.color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${background}"/>${text ? `<text x="640" y="360" fill="${item.kind === 'empty' ? '#b8c8e0' : item.color}" font-family="sans-serif" font-size="64" text-anchor="middle" dominant-baseline="middle">${xml(text)}</text>` : ''}</svg>`;
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
}

export function loadPaletteTemplates(storage) {
  try {
    const values = JSON.parse(storage.getItem(paletteTemplatesKey) || '[]');
    return Array.isArray(values) ? values.slice(0, 100).flatMap(value => {
      try { return [paletteTemplate(value)]; } catch { return []; }
    }) : [];
  } catch { return []; }
}

export function savePaletteTemplates(storage, values) {
  if (!Array.isArray(values) || values.length > 100) throw new Error('The Palette supports up to 100 custom objects.');
  storage.setItem(paletteTemplatesKey, JSON.stringify(values.map(paletteTemplate)));
}

export function createPaletteClip(value, storage = window.localStorage) {
  const item = paletteTemplate(value);
  const prefix = `palette-${item.kind}-${Date.now()}`;
  let id = prefix;
  for (let suffix = 1; storage.getItem(`${mediaStorageKey(id)}.meta`) !== null; suffix++) id = `${prefix}-${suffix}`;
  if (!validMediaId(id)) throw new Error('Could not create a unique clip ID.');
  storeWholeMedia(id, paletteDataUri(item), item.seconds);
  const key = `${mediaStorageKey(id)}.meta`;
  try {
    storage.setItem(key, JSON.stringify({ ...JSON.parse(storage.getItem(key)), palette: item }));
  } catch (error) {
    storage.removeItem(`${mediaStorageKey(id)}.part.1`);
    storage.removeItem(key);
    throw error;
  }
  return id;
}
