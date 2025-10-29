import { formatUnit } from '../utils/format';

interface SignalCardProps {
  label: string;
  value: number | undefined;
  unit?: string;
  healthy?: boolean;
}

export function SignalCard({ label, value, unit, healthy = true }: SignalCardProps) {
  if (value === undefined) {
    return (
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-gray-400 mt-2">--</div>
      </div>
    );
  }

  return (
    <div className={`bg-white p-4 rounded-lg shadow ${!healthy ? 'border-2 border-red-500' : ''}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-2 ${!healthy ? 'text-red-600' : 'text-gray-900'}`}>
        {formatUnit(value, unit)}
      </div>
    </div>
  );
}

