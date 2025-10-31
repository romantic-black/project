import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { extractBytes, formatCanLine } from '../utils/canFormat';

interface CanDataCellProps {
	msgName: string;
}

export function CanDataCell({ msgName }: CanDataCellProps) {
	const message = useTelemetryStore((s) => s.messages.get(msgName));

	const currentCanLine = useMemo(() => {
		if (!message) return null;
		const bytes = extractBytes((message as any).raw);
		const dlc = bytes.length;
		return formatCanLine(dlc, bytes);
	}, [message?.timestamp]);

	const copyMessage = async () => {
		if (!message) return;
		try {
			const bytes = extractBytes((message as any).raw);
			const dlc = bytes.length;
			const dataStr = formatCanLine(dlc, bytes);
			const fullMessage = `0x${message.msgId.toString(16).toUpperCase()} ${dataStr}`;
			await navigator.clipboard.writeText(fullMessage);
		} catch (_) {
			// Ignore copy error silently
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div className="bg-gray-50 rounded border border-gray-200 p-2 font-mono text-xs text-gray-800 whitespace-pre">
				{currentCanLine ? (
					<span>{currentCanLine}</span>
				) : (
					<span className="text-gray-400">(无数据)</span>
				)}
			</div>
			<div className="flex items-center justify-start">
				<button
					onClick={copyMessage}
					className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
					type="button"
				>
					复制报文
				</button>
			</div>
		</div>
	);
}




