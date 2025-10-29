export function formatUnit(value: number, unit?: string): string {
  if (unit === '℃' || unit === '°C') {
    return `${value.toFixed(1)}℃`;
  } else if (unit === 'Mpa' || unit === 'MPa') {
    return `${value.toFixed(2)} MPa`;
  } else if (unit === '％' || unit === '%') {
    return `${value.toFixed(1)}%`;
  } else if (unit === 'deg') {
    return `${value.toFixed(1)}°`;
  } else if (unit === 'km/h') {
    return `${value.toFixed(1)} km/h`;
  } else if (unit === 'rpm') {
    return `${value.toFixed(0)} rpm`;
  } else if (unit === 'V') {
    return `${value.toFixed(1)} V`;
  } else if (unit === 'A') {
    return `${value.toFixed(1)} A`;
  } else if (unit === 'Nm') {
    return `${value.toFixed(0)} Nm`;
  } else if (unit === 'km') {
    return `${value.toFixed(1)} km`;
  } else if (unit === 'deg/s') {
    return `${value.toFixed(1)} deg/s`;
  }
  return `${value.toFixed(2)} ${unit || ''}`.trim();
}

