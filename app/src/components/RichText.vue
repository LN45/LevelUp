<script setup lang="ts">
import { computed } from 'vue'

import { splitBold } from '@/utils/text'

const { text } = defineProps<{ text: string }>()

const parts = computed(() => splitBold(text))
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <strong v-if="part.bold">{{ part.text }}</strong>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
