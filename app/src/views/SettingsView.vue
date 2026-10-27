<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, useTemplateRef, type StyleValue } from 'vue'

import { createBackup, parseBackup, restoreBackup, type Backup } from '@/backup'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { isStoragePersisted } from '@/db'
import { FONT_SIZES, NICKNAME_MAX_LENGTH, useSettingsStore, type Settings } from '@/stores/settings'

type ChoiceKey = 'font' | 'fontSize' | 'lineHeight' | 'speechRate' | 'autoSpeak'

interface ChoiceGroup {
  key: ChoiceKey
  legend: string
  options: { value: Settings[ChoiceKey]; label: string; style?: StyleValue }[]
}

const { settings } = storeToRefs(useSettingsStore())

const groups: ChoiceGroup[] = [
  {
    key: 'font',
    legend: 'Police',
    options: [
      { value: 'luciole', label: 'Luciole', style: { fontFamily: 'Luciole' } },
      { value: 'opendyslexic', label: 'OpenDyslexic', style: { fontFamily: 'OpenDyslexic' } },
    ],
  },
  {
    key: 'fontSize',
    legend: 'Taille du texte',
    options: FONT_SIZES.map((size) => ({
      value: size,
      label: 'Aa',
      style: { fontSize: `${size}px` },
    })),
  },
  {
    key: 'lineHeight',
    legend: 'Espace entre les lignes',
    options: [
      { value: 1.5, label: 'Normal' },
      { value: 1.8, label: 'Grand' },
      { value: 2.1, label: 'Très grand' },
    ],
  },
  {
    key: 'speechRate',
    legend: 'Vitesse de lecture',
    options: [
      { value: 'normal', label: 'Normale' },
      { value: 'slow', label: 'Lente' },
    ],
  },
  {
    key: 'autoSpeak',
    legend: 'Lecture automatique des questions',
    options: [
      { value: false, label: 'Non' },
      { value: true, label: 'Oui' },
    ],
  },
]

function choose(key: ChoiceKey, value: Settings[ChoiceKey]) {
  Object.assign(settings.value, { [key]: value })
}

const sample =
  'Le renard roux vit dans la forêt. Il chasse la nuit et dort le jour dans son terrier.'

const STORAGE_MESSAGES = {
  true: '✅ Les données sont protégées sur cet appareil.',
  false: '⚠️ Le navigateur pourrait effacer les données s’il manque de place.',
  null: 'ℹ️ Protection des données indisponible ici (connexion non sécurisée). Elle sera active sur la version en ligne.',
}
const storageMessage = ref('')
void isStoragePersisted().then((persisted) => {
  storageMessage.value = STORAGE_MESSAGES[`${persisted}`]
})

const backupStatus = ref('')

/** Date locale au format AAAA-MM-JJ, pour le nom du fichier */
function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function exportData() {
  const content = await createBackup(settings.value)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `levelup-sauvegarde-${localDate()}.json`
  link.click()
  // Délai : certains navigateurs lisent le lien après le clic
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  backupStatus.value = '✅ Sauvegarde téléchargée.'
}

const fileInput = useTemplateRef('file-input')
const importDialog = useTemplateRef('import-dialog')
const pendingImport = ref<Backup | null>(null)

async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Vidé pour pouvoir choisir à nouveau le même fichier
  input.value = ''
  if (!file) return
  const backup = parseBackup(await file.text())
  if (!backup) {
    backupStatus.value = '⚠️ Ce fichier n’est pas une sauvegarde LevelUp.'
    return
  }
  pendingImport.value = backup
  if (!(await importDialog.value?.open())) return
  try {
    await restoreBackup(backup)
    settings.value = backup.settings
    backupStatus.value = '✅ Sauvegarde importée.'
  } catch (error) {
    console.error('Import de la sauvegarde impossible', error)
    backupStatus.value = '⚠️ L’import a échoué. Les données actuelles n’ont pas changé.'
  }
}
</script>

<template>
  <section class="settings">
    <h1>Réglages</h1>

    <div class="field">
      <label for="nickname">Pseudo</label>
      <input
        id="nickname"
        v-model.trim="settings.nickname"
        class="text-input"
        :maxlength="NICKNAME_MAX_LENGTH"
        autocomplete="off"
        autocapitalize="words"
      />
    </div>

    <fieldset v-for="group in groups" :key="group.key" class="choices">
      <legend>{{ group.legend }}</legend>
      <label
        v-for="option in group.options"
        :key="String(option.value)"
        class="btn choice"
        :class="{ 'choice--selected': settings[group.key] === option.value }"
        :style="option.style"
      >
        <input
          type="radio"
          class="visually-hidden"
          :name="group.key"
          :checked="settings[group.key] === option.value"
          @change="choose(group.key, option.value)"
        />
        {{ option.label }}
      </label>
    </fieldset>

    <div class="sample">
      <h2>Aperçu</h2>
      <div class="sample-text">
        <p>{{ sample }}</p>
        <SpeakButton :text="sample" />
      </div>
    </div>

    <div class="field">
      <h2>Matières et leçons</h2>
      <RouterLink to="/settings/subjects" class="btn">Gérer les matières</RouterLink>
      <RouterLink to="/settings/lessons" class="btn">Gérer les leçons</RouterLink>
    </div>

    <div class="field">
      <h2>Données</h2>
      <p class="storage">{{ storageMessage }}</p>
      <button type="button" class="btn" @click="exportData">💾 Exporter mes données</button>
      <button type="button" class="btn" @click="fileInput?.click()">
        📂 Importer une sauvegarde
      </button>
      <input
        ref="file-input"
        type="file"
        accept="application/json,.json"
        hidden
        @change="importData"
      />
      <p v-if="backupStatus" role="status">{{ backupStatus }}</p>
    </div>

    <ConfirmDialog ref="import-dialog" confirm-label="Remplacer">
      <template v-if="pendingImport">
        <p><strong>Remplacer toutes les données ?</strong></p>
        <p>
          La sauvegarde contient {{ pendingImport.lessons.length }} leçon(s). Les matières, leçons,
          révisions, l’expérience et les réglages actuels seront remplacés.
        </p>
        <p>On ne pourra pas revenir en arrière.</p>
      </template>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}
h1,
h2 {
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.field label,
legend {
  font-weight: 700;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: var(--space-s);
  padding: 0;
}
.choice {
  flex: 1 1 auto;
  font-weight: 400;
}
.choice--selected {
  background: var(--color-ink);
  border-color: var(--color-ink);
  color: var(--color-cream);
  font-weight: 700;
}
.choice:has(:focus-visible) {
  outline: 3px solid var(--color-accent);
  outline-offset: 3px;
}

.sample-text {
  display: flex;
  align-items: flex-start;
  gap: var(--space-m);
  margin-top: var(--space-s);
  padding: var(--space-m);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.sample-text p {
  flex: 1;
  margin: 0;
}
</style>
