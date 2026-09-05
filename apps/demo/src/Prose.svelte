<script lang="ts">
  import DemoNav from './DemoNav.svelte';
</script>

<DemoNav />

<main class="mx-auto max-w-3xl px-6 py-10 pb-40">
  <h1 class="text-4xl font-bold mt-0">On repetition</h1>

  <p class="lede text-lg text-muted max-w-prose">
    Cancel anytime, no questions asked. The paragraphs below repeat themselves on purpose, so an
    anchor has to lean on its prefix and suffix rather than on the quote alone.
  </p>

  <p id="twice" class="body">
    A first sentence sets the scene and gives the anchor something to hold on to on the left.
    The margin is too tight here, which is the phrase we care about, and it is followed by a
    stretch of ordinary filler that pushes the second copy far enough down the paragraph that the
    two never share a line. Filler, filler, and more filler, because a paragraph that repeats
    itself has to be long enough for the repetition to mean something at all.
    The margin is too tight here, said again, and this second copy is the one the test annotates.
    A closing sentence follows so the suffix of the second occurrence is not the empty string.
  </p>

  <p id="once" class="body">
    This paragraph mentions the margin exactly once, so a quote taken from it is unambiguous even
    without a prefix. It exists to prove that the ladder does not need to work hard when it does
    not have to.
  </p>

  <blockquote id="quote" class="border rounded-lg bg-surface p-4">
    A block quote lives in its own container. Selecting from the paragraph above into this one
    crosses a block boundary and becomes a single annotation naming both blocks.
  </blockquote>

  <p id="tail" class="body">
    The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
    Two identical sentences, one after the other, sharing a line when the window is wide.
  </p>

  <ul class="list">
    <li>List items are block containers too.</li>
    <li>The margin is too tight here, a third time, in a different container entirely.</li>
    <li>So the container selector alone already disambiguates this one.</li>
  </ul>
</main>

<style>
  .body { max-width: 62ch; }
  .list { max-width: 62ch; }
</style>
