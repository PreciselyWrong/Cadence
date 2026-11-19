// Cache rule of the files served from dist/. Hashed build assets are cached
// for good; files whose name never changes must be revalidated, or a browser
// keeps an old copy for a year (old translations showed newer strings in
// English).
const NEVER_CACHE = new Set(['/index.html', '/sw.js', '/manifest.json']);

const staticCacheControl = (relativePath) => {
    const rel = relativePath.replace(/\\/g, '/');
    if (NEVER_CACHE.has(rel) || rel.startsWith('/locales/')) return 'no-cache';
    return null;
};

module.exports = { staticCacheControl };
