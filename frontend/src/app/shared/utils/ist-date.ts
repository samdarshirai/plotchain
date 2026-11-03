// All user-facing date-times are shown in Indian Standard Time, whatever the browser's timezone.
export const IST_OFFSET = '+0530';
export const IST_DATE_TIME = 'd MMM y, h:mm:ss a';

const istFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : istFormat.format(d);
}
