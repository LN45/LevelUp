<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

// Instancié tout de suite pour appliquer police, taille et interligne dès le premier affichage
useSettingsStore()

const links = [
  { to: '/', label: 'Accueil', icon: 'M3 11 L12 3 L21 11 V21 H15 V15 H9 V21 H3 Z' },
  {
    to: '/settings',
    label: 'Réglages',
    icon: 'M4 6 H14 M18 6 H20 M4 12 H8 M12 12 H20 M4 18 H12 M16 18 H20 M16 4 V8 M10 10 V14 M14 16 V20',
  },
]
</script>

<template>
  <div class="layout">
    <main class="content">
      <RouterView />
    </main>

    <nav class="bottom-nav" aria-label="Navigation principale">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="link.icon" /></svg>
        {{ link.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.content {
  flex: 1;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--space-m);
}

.bottom-nav {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--color-ink);
}

.nav-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: 4rem;
  padding: var(--space-s);
  border-top: 4px solid transparent;
  color: var(--color-cream);
  font-size: 0.85rem;
  text-decoration: none;
}
.nav-link.router-link-exact-active {
  border-top-color: var(--color-gold);
  font-weight: 700;
}

svg {
  width: 1.6rem;
  height: 1.6rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
