export const websocketSceneMessageEvent = 'urlAutofill:websocket-scene-message';
export const websocketSceneCommandEvent = 'urlAutofill:websocket-scene-command';
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

/** Recognize scene metadata separately from file/render/text replies. */
export function sceneObjectMessage(value) {
  let message;
  try { message = JSON.parse(value); } catch { return null; }
  if (!message || typeof message !== 'object') return null;
  if (message.type === 'scene_objects_pending') return message.version === 1 ? message : null;
  if (['pointer_follow_result', 'pointer_plane_set_result'].includes(message.type)) return id(message.request_id) && typeof message.ok === 'boolean' ? message : null;
  if (message.type !== 'scene_objects' || message.version !== 1 || !id(message.scene?.id) ||
      typeof message.scene.name !== 'string' || !Number.isSafeInteger(message.revision) || message.revision < 1 ||
      !Array.isArray(message.objects) || message.objects.length > 4096) return null;
  const ids = new Set();
  for (const object of message.objects) {
    if (!object || !id(object.id) || ids.has(object.id) || typeof object.name !== 'string' ||
        typeof object.object_type !== 'string' || typeof object.can_follow !== 'boolean') return null;
    ids.add(object.id);
  }
  return message;
}

export function validSceneCommand(message) {
  if (message?.type === 'scene_objects_request') return true;
  if (message?.type === 'pointer_plane_set') return id(message.request_id) && id(message.scene_id) &&
    Number.isSafeInteger(message.revision) && message.revision > 0 &&
    [message.width, message.height].every(n => Number.isFinite(n) && n >= .001 && n <= 1000000);
  return message?.type === 'pointer_follow' && id(message.request_id) && id(message.scene_id) &&
    id(message.object_id) && Number.isSafeInteger(message.revision) && message.revision > 0 &&
    (message.enable === undefined || typeof message.enable === 'boolean');
}
