/** Only server-provided raster locations are displayable; never local paths/blobs/data. */
export function safeImagePath(value) {
  if (typeof value !== 'string' || value.length > 512 || /[\s\\\u0000-\u001f]/.test(value)) return null;
  if (/^\/uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !/\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function createEventImage(path, document = globalThis.document) {
  const safe = safeImagePath(path);
  if (!safe) return null;
  const image = document.createElement('img');
  image.src = safe;
  image.alt = 'Event image';
  image.className = 'event-image';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => { image.hidden = true; });
  return image;
}
