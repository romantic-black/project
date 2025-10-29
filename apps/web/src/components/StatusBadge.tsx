interface StatusBadgeProps {
  label: string;
  value: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatusBadge({ label, value, variant = 'default' }: StatusBadgeProps) {
  const colors = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 mb-1">{label}</span>
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[variant]}`}>
        {value}
      </span>
    </div>
  );
}

