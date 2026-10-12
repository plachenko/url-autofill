export const scenesStorageKey = 'urlAutofill.scenes.v1';

const sceneKeys = ['urlAutofill.v1', 'urlAutofill.compositor.v1', 'urlAutofill.session.v1'];
const sceneId = () => `scene-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function sceneName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Enter a scene name up to 80 characters.');
  return trimmed;
}

function readScenes(storage) {
  const raw = storage.getItem(scenesStorageKey);
  if (raw === null) {
    const id = sceneId();
    const registry = { version: 1, activeId: id, scenes: [{ id, name: 'Scene 1' }] };
    storage.setItem(scenesStorageKey, JSON.stringify(registry));
    return registry;
  }
  let registry;
  try { registry = JSON.parse(raw); } catch { throw new Error('Saved scenes could not be read.'); }
  if (registry?.version !== 1 || !Array.isArray(registry.scenes) ||
      !registry.scenes.length || typeof registry.activeId !== 'string' ||
      !registry.scenes.some(scene => scene.id === registry.activeId) ||
      new Set(registry.scenes.map(scene => scene.id)).size !== registry.scenes.length ||
      registry.scenes.some(scene => typeof scene.id !== 'string' ||
        typeof scene.name !== 'string' || !scene.name || scene.name.length > 80 ||
        (scene.id !== registry.activeId && !validBackup(scene.backup))))
    throw new Error('Saved scenes are invalid.');
  return registry;
}

function validBackup(backup) {
  return backup && typeof backup === 'object' && !Array.isArray(backup) &&
    Object.entries(backup).every(([key, value]) => sceneKeys.includes(key) && typeof value === 'string');
}

function snapshot(storage) {
  return Object.fromEntries(sceneKeys.flatMap(key => {
    const value = storage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
}

function restore(storage, backup) {
  for (const key of sceneKeys) storage.removeItem(key);
  for (const [key, value] of Object.entries(backup)) storage.setItem(key, value);
}

function transition(storage, registry, backup) {
  const previous = snapshot(storage);
  const oldRegistry = storage.getItem(scenesStorageKey);
  try {
    restore(storage, backup);
    storage.setItem(scenesStorageKey, JSON.stringify(registry));
  } catch (error) {
    restore(storage, previous);
    if (oldRegistry === null) storage.removeItem(scenesStorageKey);
    else storage.setItem(scenesStorageKey, oldRegistry);
    throw error;
  }
  return listScenes(storage);
}

export function listScenes(storage) {
  const registry = readScenes(storage);
  return { activeId: registry.activeId,
    scenes: registry.scenes.map(({ id, name }) => ({ id, name })) };
}

export function createScene(storage, name) {
  const registry = readScenes(storage);
  const id = sceneId();
  const next = { ...registry, activeId: id,
    scenes: [...registry.scenes.map(scene => scene.id === registry.activeId
      ? { ...scene, backup: snapshot(storage) } : scene),
      { id, name: sceneName(name) }] };
  return transition(storage, next, {});
}

export function switchScene(storage, id) {
  const registry = readScenes(storage);
  if (id === registry.activeId) return listScenes(storage);
  const target = registry.scenes.find(scene => scene.id === id);
  if (!target) throw new Error('Scene not found.');
  const next = { ...registry, activeId: id,
    scenes: registry.scenes.map(scene => scene.id === registry.activeId
      ? { ...scene, backup: snapshot(storage) }
      : scene.id === id ? { id: scene.id, name: scene.name } : scene) };
  return transition(storage, next, target.backup);
}

export function renameScene(storage, id, name) {
  const registry = readScenes(storage);
  if (!registry.scenes.some(scene => scene.id === id)) throw new Error('Scene not found.');
  const next = { ...registry, scenes: registry.scenes.map(scene => scene.id === id
    ? { ...scene, name: sceneName(name) } : scene) };
  storage.setItem(scenesStorageKey, JSON.stringify(next));
  return listScenes(storage);
}

export function deleteScene(storage, id) {
  const registry = readScenes(storage);
  if (registry.scenes.length === 1) throw new Error('Keep at least one scene.');
  if (!registry.scenes.some(scene => scene.id === id)) throw new Error('Scene not found.');
  const remaining = registry.scenes.filter(scene => scene.id !== id);
  if (id !== registry.activeId) {
    storage.setItem(scenesStorageKey, JSON.stringify({ ...registry, scenes: remaining }));
    return listScenes(storage);
  }
  const target = remaining[0];
  const next = { ...registry, activeId: target.id,
    scenes: remaining.map(scene => scene.id === target.id
      ? { id: scene.id, name: scene.name } : scene) };
  return transition(storage, next, target.backup);
}
