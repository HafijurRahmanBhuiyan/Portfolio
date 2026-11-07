const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const checks = ['/', '/developer', '/api/public-projects'];
for (const path of checks) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  if (path === '/api/public-projects' && !Array.isArray(await response.json()))
    throw new Error('Public projects response is not an array.');
  console.log(`${path}: ${response.status}`);
}
