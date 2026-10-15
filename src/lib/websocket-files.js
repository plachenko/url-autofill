const CHUNK_BYTES = 192 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const TYPES = new Set(['file_start', 'file_chunk', 'file_end', 'file_cancel']);

/** Receive Blender's independently base64-encoded chunks without joining base64 strings. */
export function createFileReceiver({ send, onProgress, onComplete,
  digest = bytes => globalThis.crypto.subtle.digest('SHA-256', bytes),
  timeoutMs = 60_000, maxBytes = MAX_BYTES }) {
  const transfers = new Map();
  const retired = new Set();
  let disposed = false;
  const publish = (t, state, error = '') => onProgress({ id: t.id, name: t.name,
    received: t.received || 0, total: Number.isSafeInteger(t.bytes) && t.bytes >= 0 ? t.bytes : 0, state, error });
  const ack = (id, ok, error) => {
    try { send(JSON.stringify({ type: 'file_ack', id, ok, ...(error ? { error } : {}) })); }
    catch { /* A closing socket cannot acknowledge. */ }
  };
  function release(t) {
    clearTimeout(t.timer);
    transfers.delete(t.id);
    retired.add(t.id);
    if (retired.size > 128) retired.delete(retired.values().next().value);
    t.parts?.clear();
  }
  function fail(t, message) {
    release(t);
    if (disposed) return;
    publish(t, 'Failed', message);
    ack(t.id, false, message);
  }
  function touch(t) {
    clearTimeout(t.timer);
    t.timer = setTimeout(() => fail(t, 'Transfer timed out.'), timeoutMs);
  }
  return {
    async receive(value) {
      if (disposed) return false;
      let m;
      try { m = JSON.parse(value); } catch { return false; }
      if (!m || !TYPES.has(m.type)) return false;
      if (typeof m.id !== 'string' || !m.id || m.id.length > 128) return true;
      if (retired.has(m.id)) return true;
      let t = transfers.get(m.id);
      try {
        if (m.type === 'file_start') {
          if (t) throw new Error('Duplicate transfer ID.');
          t = { id: m.id, name: m.name, bytes: m.bytes, received: 0 };
          if (typeof m.name !== 'string' || !m.name || m.name.length > 1024 ||
              !Number.isSafeInteger(m.bytes) || m.bytes < 0 || m.bytes > maxBytes ||
              !Number.isSafeInteger(m.chunks) || m.chunks !== Math.ceil(m.bytes / CHUNK_BYTES) ||
              m.encoding !== 'base64') throw new Error('Invalid file metadata or file exceeds the size limit.');
          if (transfers.size >= 4 || [...transfers.values()].reduce((n, item) => n + item.bytes, 0) + m.bytes > maxBytes)
            throw new Error('Too many files or too much data in progress.');
          Object.assign(t, { chunks: m.chunks, mime: typeof m.mime === 'string' &&
            /^[\w.+-]+\/[\w.+-]+$/.test(m.mime) ? m.mime : 'application/octet-stream', parts: new Map() });
          transfers.set(t.id, t);
          touch(t);
          publish(t, 'Receiving');
          return true;
        }
        if (!t) throw new Error('No matching file_start message.');
        if (m.type === 'file_cancel') {
          release(t);
          publish(t, 'Cancelled');
          return true;
        }
        if (m.type === 'file_chunk') {
          if (!Number.isInteger(m.index) || m.index < 0 || m.index >= t.chunks ||
              typeof m.data !== 'string' || m.data.length > CHUNK_BYTES / 3 * 4 ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data))
            throw new Error('Invalid file chunk.');
          const raw = atob(m.data);
          if (btoa(raw) !== m.data || raw.length !== Math.min(CHUNK_BYTES, t.bytes - m.index * CHUNK_BYTES))
            throw new Error('Invalid chunk length or base64 encoding.');
          const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
          const previous = t.parts.get(m.index);
          if (previous) {
            if (previous.some((byte, i) => byte !== bytes[i])) throw new Error('Conflicting duplicate chunk.');
          } else {
            t.parts.set(m.index, bytes);
            t.received += bytes.length;
          }
          touch(t);
          publish(t, 'Receiving');
          return true;
        }
        if (t.parts.size !== t.chunks || t.received !== t.bytes) throw new Error('File is missing chunks.');
        if (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(m.sha256)) throw new Error('Invalid SHA-256 checksum.');
        touch(t);
        publish(t, 'Verifying');
        const blob = new Blob(Array.from({ length: t.chunks }, (_, i) => t.parts.get(i)), { type: t.mime });
        let hash;
        try { hash = await digest(await blob.arrayBuffer()); }
        catch { throw new Error('Checksum verification failed. Open this page using HTTPS or localhost.'); }
        if (disposed || transfers.get(t.id) !== t) return true;
        const hex = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        if (hex !== m.sha256.toLowerCase()) throw new Error('SHA-256 checksum mismatch.');
        onComplete({ id: t.id, name: t.name, mime: t.mime, bytes: t.bytes, blob });
        release(t);
        publish(t, 'Complete');
        ack(t.id, true);
      } catch (error) {
        if (!disposed) fail(t || { id: m.id, name: 'File' }, error.message || 'File transfer failed.');
      }
      return true;
    },
    cancel(id) {
      const t = transfers.get(id);
      if (!t) return;
      release(t);
      publish(t, 'Cancelled');
      // Blender 1.4 accepts negative acknowledgments after sending finishes.
      ack(id, false, 'Cancelled by receiver.');
    },
    dispose(reason = 'Disconnected during transfer.') {
      for (const t of transfers.values()) {
        publish(t, 'Failed', reason);
        clearTimeout(t.timer);
        t.parts.clear();
      }
      transfers.clear();
      disposed = true;
    }
  };
}
