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
