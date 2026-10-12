import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAllAppStorage, createSessionBackup, projectsStorageKey, restoreSessionBackup } from '../src/lib/app-storage.js';
import { createProject, deleteProject, listProjects, renameProject, switchProject } from '../src/lib/project-store.js';

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

test('existing session becomes first project and switching keeps both workspaces', () => {
  const saved = storage([
    ['urlAutofill.v1', 'first text'],
    ['urlAutofill.media.v1.clip.part.1', 'first image'],
    ['paneforge:urlAutofill.panes.v1', 'first layout'],
    ['other-app', 'keep']
  ]);
  const first = listProjects(saved).activeId;
  assert.equal(listProjects(saved).projects[0].name, 'Project 1');

  createProject(saved, 'Second');
  const second = listProjects(saved).activeId;
  assert.equal(saved.getItem('urlAutofill.v1'), null);
  saved.setItem('urlAutofill.v1', 'second text');
  switchProject(saved, first);
  assert.equal(saved.getItem('urlAutofill.v1'), 'first text');
  assert.equal(saved.getItem('urlAutofill.media.v1.clip.part.1'), 'first image');
  assert.equal(saved.getItem('paneforge:urlAutofill.panes.v1'), 'first layout');
  renameProject(saved, first, 'Original');
  assert.equal(listProjects(saved).projects[0].name, 'Original');
  switchProject(saved, second);
  assert.equal(saved.getItem('urlAutofill.v1'), 'second text');
  assert.equal(saved.getItem('other-app'), 'keep');

  const backup = createSessionBackup(saved);
  assert.equal(backup.entries[projectsStorageKey], undefined);
  restoreSessionBackup(saved, backup);
  assert.equal(listProjects(saved).projects.length, 2);
  deleteProject(saved, first);
  assert.equal(listProjects(saved).projects.length, 1);
  assert.throws(() => deleteProject(saved, second), /at least one/);
  clearAllAppStorage(saved);
  assert.equal(saved.getItem(projectsStorageKey), null);
  assert.equal(saved.getItem('other-app'), 'keep');
});

test('deleting the active project loads another project', () => {
  const saved = storage([['urlAutofill.v1', 'original']]);
  const first = listProjects(saved).activeId;
  createProject(saved, 'Temporary');
  saved.setItem('urlAutofill.v1', 'temporary');
  deleteProject(saved, listProjects(saved).activeId);
  assert.equal(listProjects(saved).activeId, first);
  assert.equal(saved.getItem('urlAutofill.v1'), 'original');
});
