import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionBackup, restoreSessionBackup } from '../src/lib/app-storage.js';
import { createProject, listProjects, switchProject } from '../src/lib/project-store.js';
import { createScene, deleteScene, listScenes, renameScene, scenesStorageKey, switchScene } from '../src/lib/scene-store.js';

function storage(initial = []) {
  const values = new Map(initial);
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('scenes keep separate composition state and share project media', () => {
  const saved = storage([
    ['urlAutofill.v1', 'first text'],
    ['urlAutofill.compositor.v1', 'first tracks'],
    ['urlAutofill.trackModes.v1', '[{"muted":true}]'],
    ['urlAutofill.session.v1', 'first playhead'],
    ['urlAutofill.media.v1.clip.part.1', 'shared image']
  ]);
  const first = listScenes(saved).activeId;
  assert.equal(listScenes(saved).scenes[0].name, 'Scene 1');
  createScene(saved, 'Second');
  const second = listScenes(saved).activeId;
  assert.equal(saved.getItem('urlAutofill.v1'), null);
  assert.equal(saved.getItem('urlAutofill.compositor.v1'), null);
  assert.equal(saved.getItem('urlAutofill.trackModes.v1'), null);
  assert.equal(saved.getItem('urlAutofill.media.v1.clip.part.1'), 'shared image');
  saved.setItem('urlAutofill.v1', 'second text');
  saved.setItem('urlAutofill.compositor.v1', 'second tracks');
  saved.setItem('urlAutofill.trackModes.v1', '[{"solo":true}]');
  switchScene(saved, first);
  assert.equal(saved.getItem('urlAutofill.v1'), 'first text');
  assert.equal(saved.getItem('urlAutofill.compositor.v1'), 'first tracks');
  assert.equal(saved.getItem('urlAutofill.trackModes.v1'), '[{"muted":true}]');
  assert.equal(saved.getItem('urlAutofill.session.v1'), 'first playhead');
  renameScene(saved, first, 'Opening');
  assert.equal(listScenes(saved).scenes[0].name, 'Opening');
  switchScene(saved, second);
  assert.equal(saved.getItem('urlAutofill.v1'), 'second text');
  assert.equal(saved.getItem('urlAutofill.compositor.v1'), 'second tracks');
  assert.equal(saved.getItem('urlAutofill.trackModes.v1'), '[{"solo":true}]');
  deleteScene(saved, second);
  assert.equal(saved.getItem('urlAutofill.v1'), 'first text');
  assert.equal(listScenes(saved).scenes.length, 1);
  assert.throws(() => deleteScene(saved, first), /at least one/);
});

test('projects and session files retain their scenes', () => {
  const saved = storage([['urlAutofill.v1', 'project one scene one']]);
  const firstProject = listProjects(saved).activeId;
  createScene(saved, 'Scene 2');
  saved.setItem('urlAutofill.v1', 'project one scene two');
  createProject(saved, 'Project 2');
  assert.equal(listScenes(saved).scenes[0].name, 'Scene 1');
  saved.setItem('urlAutofill.v1', 'project two scene one');
  switchProject(saved, firstProject);
  assert.equal(listScenes(saved).scenes.length, 2);
  assert.equal(saved.getItem('urlAutofill.v1'), 'project one scene two');

  const backup = createSessionBackup(saved);
  assert.ok(backup.entries[scenesStorageKey]);
  const restored = storage();
  restoreSessionBackup(restored, backup);
  assert.equal(listScenes(restored).scenes.length, 2);
  const firstScene = listScenes(restored).scenes[0].id;
  switchScene(restored, firstScene);
  assert.equal(restored.getItem('urlAutofill.v1'), 'project one scene one');
});
