<script setup lang="ts">
import { useTemplateRef } from 'vue'

const { confirmLabel, cancelLabel = 'Annuler' } = defineProps<{
  confirmLabel: string
  cancelLabel?: string
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let resolveChoice: ((confirmed: boolean) => void) | null = null

/** Ouvre la boîte et attend le choix ; Échap ou « Annuler » valent false */
function open(): Promise<boolean> {
  dialog.value?.showModal()
  return new Promise((resolve) => (resolveChoice = resolve))
}

function close(confirmed: boolean) {
  const resolve = resolveChoice
  resolveChoice = null
  dialog.value?.close()
  resolve?.(confirmed)
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="confirm" @close="close(false)">
    <slot />
    <div class="actions">
      <!-- Focus sur l'action sans risque -->
      <button type="button" class="btn" autofocus @click="close(false)">{{ cancelLabel }}</button>
      <button type="button" class="btn btn--primary" @click="close(true)">
        {{ confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm {
  max-width: min(30rem, calc(100% - 2 * var(--space-m)));
  padding: var(--space-l);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
}
.confirm::backdrop {
  background: rgb(31 42 85 / 60%);
}
.confirm :slotted(p) {
  margin: 0 0 var(--space-m);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  justify-content: flex-end;
}
</style>
