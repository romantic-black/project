export function formatCanLine(dlc: number, data: number[]): string {
	const shown = Array.from({ length: dlc }, (_, i) => data[i] ?? 0);
	const bytes = shown
		.map((b) => Number(b).toString(16).toUpperCase().padStart(2, '0'))
		.join(' ');
	return `[${dlc}]  ${bytes}`;
}

export function extractBytes(raw: unknown): number[] {
	if (!raw) return [];
	// Node Buffer serialized via JSON.stringify(Buffer) -> { type: 'Buffer', data: number[] }
	if (typeof raw === 'object' && raw !== null && 'type' in (raw as any) && (raw as any).type === 'Buffer' && Array.isArray((raw as any).data)) {
		return (raw as any).data as number[];
	}
	// Already an array of numbers
	if (Array.isArray(raw)) {
		return (raw as any[]).map((v) => Number(v) | 0);
	}
	// Uint8Array or ArrayLike
	if (typeof Uint8Array !== 'undefined' && raw instanceof Uint8Array) {
		return Array.from(raw);
	}
	// Hex string fallback (e.g., '0258025800000258')
	if (typeof raw === 'string') {
		const hex = raw.replace(/[^0-9a-fA-F]/g, '');
		const out: number[] = [];
		for (let i = 0; i < hex.length; i += 2) {
			const byte = hex.slice(i, i + 2);
			if (byte.length === 2) out.push(parseInt(byte, 16));
		}
		return out;
	}
	return [];
}




