import { clearAppStorage, createSessionBackup, projectsStorageKey, restoreSessionBackup } from './app-storage.js';

const emptyBackup = () => ({ format: 'url-autofill-session', version: 1, entries: {} });
const projectId = () => `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function readRegistry(storage) {
  const raw = storage.getItem(projectsStorageKey);
  if (raw === null) {
    const registry = { version: 1, activeId: projectId(), projects: [] };
    registry.projects.push({ id: registry.activeId, name: 'Project 1' });
    storage.setItem(projectsStorageKey, JSON.stringify(registry));
    return registry;
  }
  let registry;
  try { registry = JSON.parse(raw); } catch { throw new Error('Saved projects could not be read.'); }
  if (registry?.version !== 1 || !Array.isArray(registry.projects) ||
      !registry.projects.length || typeof registry.activeId !== 'string' ||
      !registry.projects.some(project => project.id === registry.activeId) ||
      registry.projects.some(project => typeof project.id !== 'string' ||
        typeof project.name !== 'string' || project.name.length < 1 ||
        (project.id !== registry.activeId && !project.backup)))
    throw new Error('Saved projects are invalid.');
  return registry;
}

export function listProjects(storage) {
  const registry = readRegistry(storage);
  return { activeId: registry.activeId,
    projects: registry.projects.map(({ id, name }) => ({ id, name })) };
}

function projectName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Enter a project name up to 80 characters.');
  return trimmed;
}

function transition(storage, next, backup) {
  const previous = createSessionBackup(storage);
  const oldRegistry = storage.getItem(projectsStorageKey);
  try {
    clearAppStorage(storage);
    storage.setItem(projectsStorageKey, JSON.stringify(next));
    restoreSessionBackup(storage, backup);
  } catch (error) {
    clearAppStorage(storage);
    if (oldRegistry === null) storage.removeItem(projectsStorageKey);
    else storage.setItem(projectsStorageKey, oldRegistry);
    restoreSessionBackup(storage, previous);
    throw error;
  }
  return listProjects(storage);
}

export function createProject(storage, name) {
  const registry = readRegistry(storage);
  const id = projectId();
  const next = { ...registry, activeId: id,
    projects: [...registry.projects.map(project => project.id === registry.activeId
      ? { ...project, backup: createSessionBackup(storage) } : project),
      { id, name: projectName(name) }] };
  return transition(storage, next, emptyBackup());
}

export function switchProject(storage, id) {
  const registry = readRegistry(storage);
  if (id === registry.activeId) return listProjects(storage);
  const target = registry.projects.find(project => project.id === id);
  if (!target) throw new Error('Project not found.');
  const next = { ...registry, activeId: id,
    projects: registry.projects.map(project => project.id === registry.activeId
      ? { ...project, backup: createSessionBackup(storage) }
      : project.id === id ? { id: project.id, name: project.name } : project) };
  return transition(storage, next, target.backup);
}

export function renameProject(storage, id, name) {
  const registry = readRegistry(storage);
  if (!registry.projects.some(project => project.id === id)) throw new Error('Project not found.');
  const next = { ...registry, projects: registry.projects.map(project => project.id === id
    ? { ...project, name: projectName(name) } : project) };
  storage.setItem(projectsStorageKey, JSON.stringify(next));
  return listProjects(storage);
}

export function deleteProject(storage, id) {
  const registry = readRegistry(storage);
  if (registry.projects.length === 1) throw new Error('Keep at least one project.');
  if (!registry.projects.some(project => project.id === id)) throw new Error('Project not found.');
  const remaining = registry.projects.filter(project => project.id !== id);
  if (id !== registry.activeId) {
    storage.setItem(projectsStorageKey, JSON.stringify({ ...registry, projects: remaining }));
    return listProjects(storage);
  }
  const target = remaining[0];
  const next = { ...registry, activeId: target.id,
    projects: remaining.map(project => project.id === target.id
      ? { id: project.id, name: project.name } : project) };
  return transition(storage, next, target.backup);
}
