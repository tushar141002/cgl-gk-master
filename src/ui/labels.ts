import type { SectionId } from '../../shared/contract';
import type { MessageKey } from './i18n/messages';

const SECTION_KEYS: Readonly<Record<SectionId, MessageKey>> = {
  history: 'section.history',
  geography: 'section.geography',
  polity: 'section.polity',
  economy: 'section.economy',
  science: 'section.science',
  'static-gk': 'section.static-gk',
  'current-affairs': 'section.current-affairs',
};

export function sectionMessageKey(section: SectionId): MessageKey {
  return SECTION_KEYS[section];
}

/**
 * `polity-fundamental-rights` → `Fundamental Rights`.
 *
 * Content will carry display names later; until then the slug is the only
 * stable human-readable label and this keeps it from looking like an id. The
 * section slug is dropped when it is passed and prefixes the sub-topic, since
 * the screen already shows the section separately.
 */
export function humanizeSubtopic(subtopic: string, section?: SectionId): string {
  const prefix = section === undefined ? '' : `${section}-`;
  const slug = prefix.length > 0 && subtopic.startsWith(prefix) ? subtopic.slice(prefix.length) : subtopic;

  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
