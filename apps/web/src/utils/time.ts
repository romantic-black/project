import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export function formatTime(date: Date | number): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

export function formatTimeShort(date: Date | number): string {
  return dayjs(date).format('HH:mm:ss');
}

