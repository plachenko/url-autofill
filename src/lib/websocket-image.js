function imageMime(bytes) {
  if (bytes.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (bytes.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (bytes.startsWith('GIF87a') || bytes.startsWith('GIF89a')) return 'image/gif';
  if (bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.startsWith('BM')) return 'image/bmp';
  return null;
}

export function websocketImageDataUrl(text) {
  let value = text.trim();
  let mime = null;

  if (value.startsWith('{')) {
    try {
      const response = JSON.parse(value);
      const image = response.image ?? response.imageData ?? response.base64 ?? response.data;
      if (typeof image === 'string') {
        value = image.trim();
        mime = response.mimeType ?? response.mime ?? response.contentType ?? null;
      }
    } catch { /* Try the response as plain text. */ }
  }

  const dataUri = value.match(/data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+={0,2})/i);
  if (dataUri) {
    mime = dataUri[1].toLowerCase();
    value = dataUri[2];
  }

  const base64 = value.replace(/\s/g, '');
  if (!/^(?:[A-Za-z0-9+/]{2,}={0,2})$/.test(base64)) {
    throw new Error('The reply does not contain a base64 image.');
  }

  let bytes;
  try { bytes = atob(base64); }
  catch { throw new Error('The reply contains invalid base64 data.'); }

  if (!mime) mime = imageMime(bytes);
  if (typeof mime !== 'string' || !/^image\/[a-z0-9.+-]+$/i.test(mime)) {
    throw new Error('Image format not recognized. Include a data:image/...;base64, prefix.');
  }
  return `data:${mime.toLowerCase()};base64,${base64}`;
}
