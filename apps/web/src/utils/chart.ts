export function combineHistoryWithLatest(
  history: Array<{ timestamp: number; value: number }>,
  latestTimestamp?: number,
  latestValue?: number
): Array<[number, number]> {
  const points = history.map((item) => [item.timestamp, item.value] as [number, number]);
  if (
    typeof latestTimestamp === 'number' &&
    typeof latestValue === 'number' &&
    (history.length === 0 || history[history.length - 1]?.timestamp !== latestTimestamp)
  ) {
    points.push([latestTimestamp, latestValue]);
  }
  return points;
}
