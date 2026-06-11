function assertSinglePathSegment(label, value) {
  const segment = value?.toString?.() ?? '';

  if (!segment) {
    throw new Error(`${label} must not be empty`);
  }
  if (segment.includes('/') || segment.includes('\\')) {
    throw new Error(`${label} must not contain path separators`);
  }
  if (segment === '.' || segment === '..') {
    throw new Error(`${label} must not contain path traversal`);
  }
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i);
    if (code <= 31 || code === 127) {
      throw new Error(`${label} contains unsafe path characters`);
    }
  }

  return segment;
}

module.exports = { assertSinglePathSegment };
