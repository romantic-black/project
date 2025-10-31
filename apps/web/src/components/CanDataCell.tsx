import { useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { extractBytes, formatCanLine } from '../utils/canFormat';

interface CanDataCellProps {
	msgName: string;
	maxLines?: number;
	flushIntervalMs?: number;
}

export function CanDataCell({ msgName, maxLines = 500, flushIntervalMs = 100 }: CanDataCellProps) {
	const message = useTelemetryStore((s) => s.messages.get(msgName));
	const [lines, setLines] = useState<string[]>([]);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const autoFollowRef = useRef(true);
	const pendingRef = useRef<string[]>([]);
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const latestLine = useMemo(() => {
		if (!message) return null;
		const bytes = extractBytes((message as any).raw);
		const dlc = bytes.length;
		return formatCanLine(dlc, bytes);
	}, [message?.timestamp]);

	useEffect(() => {
		if (!latestLine) return;
		pendingRef.current.push(latestLine);
		if (!flushTimerRef.current) {
			flushTimerRef.current = setTimeout(() => {
				setLines((prev) => {
					const appended = [...prev, ...pendingRef.current];
					pendingRef.current = [];
					if (appended.length <= maxLines) return appended;
					return appended.slice(appended.length - maxLines);
				});
				flushTimerRef.current = null;
			}, flushIntervalMs);
		}
	}, [latestLine, maxLines, flushIntervalMs]);

	useEffect(() => {
		if (!autoFollowRef.current) return;
		const el = containerRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [lines]);

	const onScroll = () => {
		const el = containerRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
		autoFollowRef.current = distanceFromBottom < 20;
	};

	const copyAll = async () => {
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
		} catch (_) {
			// Ignore copy error silently
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div
				ref={containerRef}
				onScroll={onScroll}
				className="max-h-32 overflow-y-auto bg-gray-50 rounded border border-gray-200 p-2 font-mono text-xs text-gray-800 whitespace-pre"
				style={{ lineHeight: '1.4' }}
			>
				{lines.length === 0 ? (
					<span className="text-gray-400">(无数据)</span>
				) : (
					lines.map((line, i) => <div key={i}>{line}</div>)
				)}
			</div>
			<div className="flex items-center justify-between">
				<button
					onClick={copyAll}
					className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
					type="button"
				>
					复制全部
				</button>
				{!autoFollowRef.current && (
					<button
						onClick={() => {
							autoFollowRef.current = true;
							const el = containerRef.current;
							if (el) el.scrollTop = el.scrollHeight;
						}}
						className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
						type="button"
					>
						回到底部
					</button>
				)}
			</div>
		</div>
	);
}




