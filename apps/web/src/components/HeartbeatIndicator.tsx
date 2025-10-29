import { useTelemetryStore } from '../stores/telemetry';
import { useEffect, useState } from 'react';

export function HeartbeatIndicator() {
  const { connected } = useTelemetryStore();
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!connected) {
      setIsBlinking(false);
      return;
    }

    const interval = setInterval(() => {
      setIsBlinking((prev) => !prev);
    }, 1000);

    return () => clearInterval(interval);
  }, [connected]);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full ${
          connected
            ? isBlinking
              ? 'bg-green-500'
              : 'bg-green-400'
            : 'bg-gray-400'
        }`}
      />
      <span className="text-sm text-gray-600">
        {connected ? '在线' : '离线'}
      </span>
    </div>
  );
}

