export function cleanProject(p) {
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.getPrototypeOf(p) !== Object.prototype
  )
    throw new Error('invalid project record');
  const fields = [
    'id',
    'title',
    'subtitle',
    'categories',
    'tags',
    'live',
    'github',
    'image',
    'imageAlt',
    'url',
    'status',
    'description',
  ];
  if (Object.keys(p).some((k) => !fields.includes(k)))
    throw new Error('invalid project field');
  const string = (v, max, required = false) => {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
      throw new Error('invalid project text');
    // Reject control characters that have no place in portfolio content.
    // Newlines and tabs remain valid for multi-paragraph descriptions.
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v))
      throw new Error('invalid project text');
    return v.trim();
  };
  const out = {
    id: string(p.id, 80, true),
    title: string(p.title, 180, true),
    subtitle: string(p.subtitle, 180, true),
    categories: string(p.categories, 80),
    tags: p.tags,
    live: '',
    github: '',
    image: '',
    imageAlt: string(p.imageAlt, 180),
    url: string(p.url, 300),
    status: string(p.status, 100),
    description: string(p.description, 5000, true),
  };
  if (!/^[A-Za-z0-9_-]+$/.test(out.id)) throw new Error('invalid project id');
  if (
    !Array.isArray(p.tags) ||
    p.tags.length > 30 ||
    p.tags.some(
      (t) =>
        typeof t !== 'string' ||
        t.length > 50 ||
        !t.trim() ||
        /[\u0000-\u001F\u007F]/.test(t),
    )
  )
    throw new Error('invalid project tags');
  out.tags = p.tags.map((t) => t.trim());
  for (const key of ['live', 'github']) {
    const value = string(p[key], 500);
    if (value) {
      let u;
      try {
        u = new URL(value);
      } catch {
        throw new Error('invalid project URL');
      }
      if (!['http:', 'https:'].includes(u.protocol))
        throw new Error('invalid project URL');
      out[key] = u.href;
    }
  }
  const image = string(p.image, 500);
  const isAsset =
    /^\/?assets\/[A-Za-z0-9_./-]+$/.test(image) &&
    !image.split('/').includes('..');
  const isUpload = /^\/?api\/uploads\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)$/.test(
    image,
  );
  if (image && !isAsset && !isUpload) throw new Error('invalid project image');
  out.image = image;
  return out;
}
