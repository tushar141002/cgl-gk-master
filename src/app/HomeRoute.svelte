<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProgressService } from '../services/ProgressService';
  import type { HomeStats } from '../ui/viewModels';
  import Home from '../ui/screens/Home.svelte';

  /** Loads today's numbers, then renders the screen; re-mounts on every visit. */
  let { progress, dailyGoal }: { progress: ProgressService; dailyGoal: number } = $props();

  let stats = $state<HomeStats | null>(null);
  let loading = $state(true);

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      stats = await progress.overview();
    } catch (error) {
      console.error('could not load the home overview', error);
    } finally {
      loading = false;
    }
  }
</script>

<Home {stats} {dailyGoal} {loading} />
