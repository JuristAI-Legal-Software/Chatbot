const SAFE_DATA_IMAGE_PATTERN =
  /^data:image\/(?:avif|bmp|gif|jpeg|jpg|png|webp);base64,[a-z0-9+/]+={0,2}$/i;

export function isSafeImageSrc(src?: string | null): src is string {
  if (!src) {
    return false;
  }
  const value = src.trim();
  if (!value) {
    return false;
  }
  if (SAFE_DATA_IMAGE_PATTERN.test(value)) {
    return true;
  }
  if (value.startsWith('/') && !value.startsWith('//')) {
    return true;
  }
  if (value.startsWith('blob:')) {
    return true;
  }
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns a renderable image URL after `isSafeImageSrc` has accepted it.
 *
 * Routes the value through the `URL` constructor (a CodeQL-recognized URL
 * sanitizer) so the taint flow from arbitrary string sources into JSX
 * `src=` / `href=` attributes is broken, closing
 * `js/html-constructed-from-input` false positives on `<img>` elements that
 * are already gated by `isSafeImageSrc`.
 *
 * Returns `''` on parse failure — callers should treat that as "do not render."
 */
export function toRenderableImageUrl(src: string): string {
  if (SAFE_DATA_IMAGE_PATTERN.test(src) || src.startsWith('blob:')) {
    return src;
  }
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return '';
  }
}
