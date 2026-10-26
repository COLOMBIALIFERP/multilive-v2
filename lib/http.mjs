export async function fetchWithTimeout(url, options = {}, timeoutMs = 7500, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getJSON(url, options = {}, timeoutMs = 7500, fetchImpl = fetch) {
  const res = await fetchWithTimeout(url, options, timeoutMs, fetchImpl);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`);
  return await res.json();
}

export async function appToken(url, clientId, clientSecret, timeoutMs = 7000, fetchImpl = fetch) {
  const payload = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });
  const data = await getJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString()
  }, timeoutMs, fetchImpl);
  if (!data.access_token) throw new Error('Proveedor no devolvió access_token');
  return String(data.access_token);
}
