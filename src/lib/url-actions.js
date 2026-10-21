// Free-form action commands for the `action` / `a` URL parameter and
// window.urlAutofill.run(). Commands are normalized (case, dashes, spaces,
// filler words), split on ';' or ',' and matched against a registry by the
// longest leading phrase; anything after the name is passed as `args`.

const fillerWords = new Set(['to', 'the']);

export function normalizePhrase(text) {
  return String(text ?? '').toLowerCase()
    .replace(/[-_+]+/g, ' ')
    .split(/\s+/).filter(word => word && !fillerWords.has(word)).join(' ');
}

/** Split a command list on ';' or ','. A comma between two digits is kept. */
export function splitCommands(input) {
  return String(input ?? '')
    .split(/;|(?<!\d),|,(?!\d)/)
    .map(part => part.trim()).filter(Boolean);
}

/** Parse hh:mm:ss, mm:ss, or seconds ("90", "90s", "1.5"). Returns null if invalid. */
export function parseTime(text) {
  const value = String(text ?? '').trim().toLowerCase().replace(/s(ec(onds?)?)?$/, '').replace(',', '.').trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) return null;
  const [, hours = '0', minutes, seconds] = match;
  if (Number(seconds) >= 60 || (match[1] !== undefined && Number(minutes) >= 60)) return null;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Parse one command into { name, args } using the registry's names and aliases. */
export function parseCommand(command, registry) {
  // "seek:1:30" / "seek=90" -> "seek 1:30" / "seek 90"
  const spaced = String(command).trim().replace(/^([a-z][a-z\s_+-]*?)\s*[:=]\s*/i, '$1 ');
  const words = normalizePhrase(spaced).split(' ').filter(Boolean);
  for (let length = words.length; length > 0; length--) {
    const key = words.slice(0, length).join(' ');
    if (registry.has(key)) return { name: registry.get(key).name, args: words.slice(length).join(' ') };
  }
  return { name: null, args: '', input: command };
}

/**
 * Create an action registry. Each definition is
 *   name: { run(args), aliases?: [...] }   or simply   name: run
 * Adding an action is one entry.
 */
export function createActionRegistry(definitions = {}) {
  const lookup = new Map();
  const registry = {
    define(name, definition) {
      const entry = typeof definition === 'function' ? { run: definition } : { ...definition };
      entry.name = normalizePhrase(name);
      for (const alias of [name, ...(entry.aliases || [])]) lookup.set(normalizePhrase(alias), entry);
      return registry;
    },
    names() { return [...new Set([...lookup.values()].map(entry => entry.name))]; },
    parse(input) { return splitCommands(input).map(command => parseCommand(command, lookup)); },
    /** Run a command string; returns { ran: [...names], unknown: [...inputs] }. */
    run(input, onUnknown) {
      const result = { ran: [], unknown: [] };
      for (const command of registry.parse(input)) {
        if (!command.name) { result.unknown.push(command.input); onUnknown?.(command.input); continue; }
        lookup.get(command.name).run(command.args);
        result.ran.push(command.name);
      }
      return result;
    }
  };
  for (const [name, definition] of Object.entries(definitions)) registry.define(name, definition);
  return registry;
}
