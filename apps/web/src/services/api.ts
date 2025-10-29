const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getSnapshot(signals: string[]): Promise<Record<string, number>> {
  const params = new URLSearchParams({ signals: signals.join(',') });
  const res = await fetch(`${API_BASE}/api/snapshot?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getHistory(
  signals: string[],
  from: Date,
  to: Date,
  step: '1s' | '10s' = '1s'
): Promise<any[]> {
  const params = new URLSearchParams({
    signals: signals.join(','),
    from: from.toISOString(),
    to: to.toISOString(),
    step,
  });
  const res = await fetch(`${API_BASE}/api/history?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function sendCanFrame(id: number, data: number[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/can/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, data }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `HTTP ${res.status}`);
  }
}

