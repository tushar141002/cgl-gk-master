<script lang="ts">
  import type { MessageKey } from '../ui/i18n/messages';
  import type { IconName } from '../ui/icons';
  import Icon from '../ui/Icon.svelte';
  import { useI18n } from '../ui/i18n/context';
  import type { RouteName } from './router';

  let { current }: { current: RouteName } = $props();

  const { t } = useI18n();

  const items: readonly {
    route: RouteName;
    href: string;
    labelKey: MessageKey;
    icon: IconName;
  }[] = [
    { route: 'home', href: '#/home', labelKey: 'nav.home', icon: 'home' },
    { route: 'practice', href: '#/practice', labelKey: 'nav.practice', icon: 'book-open' },
    { route: 'mock', href: '#/mock', labelKey: 'nav.mock', icon: 'timer' },
    { route: 'progress', href: '#/progress', labelKey: 'nav.progress', icon: 'chart-column' },
    { route: 'settings', href: '#/settings', labelKey: 'nav.settings', icon: 'settings' },
  ];
</script>

<nav class="nav-bar" aria-label={t('nav.primary')}>
  {#each items as item (item.route)}
    <a class="nav-bar__item" href={item.href} aria-current={current === item.route ? 'page' : undefined}>
      <span class="nav-bar__icon"><Icon name={item.icon} /></span>
      <span>{t(item.labelKey)}</span>
    </a>
  {/each}
</nav>
