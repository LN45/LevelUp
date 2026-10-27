<script setup lang="ts">
const { value, color = 'var(--color-gold)' } = defineProps<{
  /** De 0 à 1 */
  value: number
  color?: string
}>()
</script>

<template>
  <!-- Décoratif : le texte affiché à côté donne déjà l'information -->
  <div class="bar" aria-hidden="true">
    <div class="bar-fill" :style="{ width: `${value * 100}%`, background: color }" />
  </div>
</template>

<style scoped>
.bar {
  height: 0.75rem;
  overflow: hidden;
  border: 2px solid var(--color-ink);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}
</style>
