import type { Language, MockSummary } from '../../shared/contract';

/** How a mock row reads to the student at server time `now`. */
export type MockPhase = 'soon' | 'open' | 'active' | 'done' | 'expired' | 'closed';

export function mockPhase(mock: MockSummary, now: number): MockPhase {
  const session = mock.session;
  if (session !== null) {
    if (session.status === 'submitted') return 'done';
    if (session.status === 'expired') return 'expired';
    return 'active';
  }
  if (now < mock.opensAt) return 'soon';
  if (now >= mock.closesAt) return 'closed';
  return 'open';
}

/** "Sat, 15 Nov, 6:00 pm" in India time, in the student's language. */
export function formatWhen(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(epochMs));
}

/** A countdown or a duration: "14:05", or "1:02:09" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Marks print without a trailing ".0": 6, 5.5, −1.5. */
export function formatMarks(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded < 0 ? `−${Math.abs(rounded)}` : String(rounded);
}
