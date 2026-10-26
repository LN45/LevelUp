<script setup lang="ts">
import { storeToRefs } from 'pinia'

import KitsuneMascot from '@/components/KitsuneMascot.vue'
import { useSubjectsStore } from '@/stores/subjects'

const { subjects } = storeToRefs(useSubjectsStore())
</script>

<template>
  <section class="subjects">
    <h1>Mes matières</h1>

    <ul v-if="subjects?.length" class="grid">
      <li v-for="subject in subjects" :key="subject.id">
        <RouterLink
          :to="{ name: 'subject', params: { id: subject.id } }"
          class="card subject"
          :style="{ '--subject-color': subject.color }"
        >
          <span class="icon" aria-hidden="true">{{ subject.icon }}</span>
          <span class="name">{{ subject.name }}</span>
        </RouterLink>
      </li>
    </ul>

    <div v-else-if="subjects" class="empty">
      <KitsuneMascot class="mascot" mood="thinking" />
      <p>Pas encore de matière. Un adulte peut en ajouter dans les réglages.</p>
    </div>
  </section>
</template>

<style scoped>
h1 {
  margin-top: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--space-m);
  margin: 0;
  padding: 0;
  list-style: none;
}

.subject {
  min-height: 4.5rem;
  border-left: 0.6rem solid var(--subject-color);
}
.icon {
  font-size: 2rem;
  line-height: 1;
}
.name {
  font-weight: 700;
  /* Jamais de coupure au milieu d'un mot, sauf s'il ne tient vraiment pas */
  overflow-wrap: break-word;
}

.empty {
  text-align: center;
}
.mascot {
  max-width: 12rem;
  margin: 0 auto;
}
</style>
