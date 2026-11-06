<script lang="ts">
  /**
   * Rendered instead of App when IndexedDB cannot open (F1 failure path).
   * Both languages are shown because settings could not be read.
   */
  function retry(): void {
    globalThis.location.reload();
  }
</script>

<main class="container page empty">
  <h1 class="empty__title">Storage unavailable</h1>
  <p>CGL GK Master could not open its database. Free some space and try again.</p>
  <p lang="hi">CGL GK Master अपना डेटाबेस नहीं खोल सका। थोड़ी जगह खाली करके फिर कोशिश करें।</p>
  <button class="btn btn--primary" type="button" onclick={retry}>Retry · फिर कोशिश करें</button>
</main>
