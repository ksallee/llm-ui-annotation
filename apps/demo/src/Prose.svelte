<script lang="ts">
  import DemoNav from './DemoNav.svelte';
</script>

<DemoNav />

<main class="mx-auto max-w-3xl px-6 py-10 pb-40">
  <h1 class="text-4xl font-bold mt-0">On dogs, repeatedly</h1>

  <p class="lede text-lg text-muted max-w-prose">
    Every dog below is described more than once on purpose, which is a polite way of saying this
    page was written to be difficult. An anchor that only knows the quote will get lost here.
  </p>

  <p id="twice" class="body">
    A first sentence opens the kennel, mostly so the anchor has something to hold on to on the left.
    The beagle sleeps under the window, which is the phrase we care about, and it is followed by a
    stretch of ordinary filler about retrievers that pushes the second copy far enough down the
    paragraph that the two never share a line. Terriers, lurchers, and more terriers, none of whom
    asked to be here, because a paragraph that repeats itself has to be long enough for the
    repetition to mean something at all. The beagle sleeps under the window, said again, and this
    second copy is the one the test annotates — the same dog, the same window, a worse night's
    sleep. A closing sentence follows so the suffix of the second occurrence is not empty, and the
    beagle would like it on record that it has never once been asked.
  </p>

  <p id="once" class="body">
    This paragraph mentions the beagle exactly once, which makes it the easy one, and it knows it.
    A quote taken from here is unambiguous without a prefix, so the ladder gets to stop on the
    first rung and go home early.
  </p>

  <blockquote id="quote" class="border rounded-lg bg-surface p-4">
    A block quote lives in its own container, and so does the greyhound, who considers this
    correct. Selecting from the paragraph above into this one crosses a block boundary and becomes
    a single annotation naming both blocks, which is the sort of thing the greyhound would call a
    fuss about nothing.
  </blockquote>

  <p id="tail" class="body">
    The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
    Two identical sentences, one after the other, sharing a line when the window is wide, and the
    lazy dog has been jumped over twice for reasons nobody has explained to it.
  </p>

  <ul class="list">
    <li>List items are block containers too, and are quite pleased about it.</li>
    <li>The beagle sleeps under the window, a third time, in a different container entirely.</li>
    <li>So the container selector alone disambiguates this one, and the beagle can finally rest.</li>
  </ul>
</main>

<style>
  .body { max-width: 62ch; }
  .list { max-width: 62ch; }
</style>
