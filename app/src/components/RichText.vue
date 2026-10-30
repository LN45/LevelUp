<script setup lang="ts">
import { computed } from 'vue'

import { useForeignLanguage } from '@/composables/useSpeech'
import { splitRich } from '@/utils/text'

const { text } = defineProps<{ text: string }>()

const parts = computed(() => splitRich(text))
const foreignLanguage = useForeignLanguage()
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <span
        v-if="part.foreign"
        class="foreign"
        :class="{ bold: part.bold }"
        :lang="foreignLanguage ?? undefined"
        >{{ part.text }}</span
      >
      <strong v-else-if="part.bold">{{ part.text }}</strong>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>

<style scoped>
/* Pas d'italique (difficile à lire) : un soulignement en pointillés suffit à repérer la langue */
.foreign {
  text-decoration: underline dotted var(--color-fox);
  text-decoration-thickness: 0.12em;
  text-underline-offset: 0.25em;
}
.bold {
  font-weight: 700;
}
</style>
