/** Build a full API URL for a resource endpoint (with trailing slash). */
export function buildApiUrl(endpoint: string): string {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
  const path = endpoint.replace(/^\//, '').replace(/\/$/, '');
  return `${base}/${path}/`;
}
