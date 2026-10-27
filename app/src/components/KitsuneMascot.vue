<script setup lang="ts">
import { computed, useId } from 'vue'

import { useProgressStore } from '@/stores/progress'
import { MAX_LEVEL } from '@/utils/progress'

export type MascotMood = 'happy' | 'encouraging' | 'thinking' | 'proud'

const {
  mood = 'happy',
  tails,
  growTail = false,
} = defineProps<{
  mood?: MascotMood
  /** 1 à 9 ; par défaut, le niveau de l'élève */
  tails?: number
  /** Fait pousser la dernière queue (montée de niveau) */
  growTail?: boolean
}>()

const progress = useProgressStore()

const moodLabels: Record<MascotMood, string> = {
  happy: 'content',
  encouraging: 'qui encourage',
  thinking: 'pensif',
  proud: 'fier',
}

// Les marques rouges du masque servent de sourcils : ce sont elles qui portent l'expression
const brows: Record<MascotMood, string> = {
  happy: 'M70 61 L90 67 M130 61 L110 67',
  encouraging: 'M70 60 Q80 56 90 61 M130 60 Q120 56 110 61',
  thinking: 'M70 61 L90 67 M110 63 L130 55',
  proud: 'M70 59 L90 67 M130 59 L110 67',
}

const mouths: Record<MascotMood, string> = {
  happy: 'M94 110 Q102 113 108 106',
  encouraging: 'M92 109 Q100 118 108 109 Z',
  thinking: 'M95 111 L106 109',
  proud: 'M92 109 Q102 114 110 105',
}

// Paupières mi-closes (regard assuré) sauf quand il encourage
const eyes = computed(() =>
  mood === 'encouraging'
    ? {
        left: 'M73 74 Q83 66 93 77 Q82 81 73 74 Z',
        right: 'M127 74 Q117 66 107 77 Q118 81 127 74 Z',
        pupilRy: 4,
      }
    : {
        left: 'M73 75 Q83 71 93 77 Q82 80 73 75 Z',
        right: 'M127 75 Q117 71 107 77 Q118 80 127 75 Z',
        pupilRy: 2.6,
      },
)

const bodyPath = 'M86 120 L114 120 L121 140 L135 170 L132 180 L68 180 L65 170 L79 140 Z'
const headPath = 'M100 44 L128 52 L143 76 L134 94 L100 124 L66 94 L57 76 L72 52 Z'

// Ids uniques : plusieurs mascottes peuvent coexister sur une page
const uid = useId()
const tailId = `${uid}-tail`
const clipId = `${uid}-clip`

// Les queues s'ouvrent en éventail autour du bas du corps
const tailAngles = computed(() => {
  const count = Math.min(MAX_LEVEL, Math.max(1, Math.round(tails ?? progress.level.level)))
  if (count === 1) return [55]
  const spread = Math.min(62, 20 + count * 5)
  return Array.from({ length: count }, (_, i) => -spread + (2 * spread * i) / (count - 1))
})

const pupilShift = computed(() => (mood === 'thinking' ? { x: 3, y: -2 } : { x: 0, y: 0 }))
</script>

<template>
  <svg
    class="mascot"
    :class="`mascot--${mood}`"
    viewBox="0 0 200 200"
    role="img"
    :aria-label="`Kitsuné ${moodLabels[mood]}`"
  >
    <defs>
      <path :id="tailId" d="M0 0 C-18 -18 -30 -52 -12 -92 L-4 -72 L7 -86 C18 -54 14 -18 0 0 Z" />
      <clipPath :id="clipId">
        <use :href="`#${tailId}`" />
      </clipPath>
    </defs>

    <ellipse class="shadow" cx="100" cy="181" rx="44" ry="5" />

    <g class="tails">
      <g
        v-for="(angle, index) in tailAngles"
        :key="angle"
        :transform="`translate(100 170) rotate(${angle}) scale(1.1)`"
      >
        <g :class="{ 'tail-new': growTail && index === tailAngles.length - 1 }">
          <use :href="`#${tailId}`" class="fur" />
          <circle cx="-4" cy="-88" r="22" class="fur-light" :clip-path="`url(#${clipId})`" />
          <use :href="`#${tailId}`" class="outline contour" />
        </g>
      </g>
    </g>

    <!-- Corps assis : une silhouette ombrée à droite, plastron clair, pattes à chaussettes sombres -->
    <path class="fur" :d="bodyPath" />
    <path class="fur-shade" d="M100 120 L114 120 L121 140 L135 170 L132 180 L100 180 Z" />
    <path class="outline contour" :d="bodyPath" />
    <path class="fur-light" d="M87 121 L113 121 L100 152 Z" />
    <path class="facet" d="M79 150 L86 176 M121 150 L114 176" />
    <path
      class="fur outline"
      d="M88 148 L97 148 L97 180 L87 180 Z M112 148 L103 148 L103 180 L113 180 Z"
    />
    <path
      class="sock"
      d="M87.3 168 L97 168 L97 180 L87 180 Z M112.7 168 L103 168 L103 180 L113 180 Z"
    />

    <!-- Foulard -->
    <path class="scarf outline" d="M84 119 L116 119 L113 128 L87 128 Z" />
    <path class="scarf outline" d="M104 126 L113 142 L104 139 L100 127 Z" />

    <!-- Oreilles -->
    <g class="ear ear--left">
      <path class="fur outline" d="M72 54 L62 8 L96 46 Z" />
      <path class="ear-inner" d="M75 47 L67 21 L88 44 Z" />
      <path class="ink" d="M62 8 L65 21.8 L72.2 19.4 Z" />
    </g>
    <g class="ear ear--right">
      <path class="fur outline" d="M128 54 L138 8 L104 46 Z" />
      <path class="ear-inner" d="M125 47 L133 21 L112 44 Z" />
      <path class="ink" d="M138 8 L135 21.8 L127.8 19.4 Z" />
    </g>

    <!-- Tête anguleuse ombrée à droite, museau clair et arête rousse -->
    <path class="fur" :d="headPath" />
    <path class="fur-shade" d="M100 44 L128 52 L143 76 L107 80 L100 60 Z" />
    <path
      class="fur-light"
      d="M58.5 77 L80 84 L100 90 L120 84 L141.5 77 L133 93 L100 122 L67 93 Z"
    />
    <path class="fur" d="M93 80 L100 98 L107 80 L100 60 Z" />
    <path class="outline contour" :d="headPath" />
    <path class="marking" d="M100 50 L104 59 L100 67 L96 59 Z" />
    <path class="ink" d="M95 98 L105 98 L100 104 Z" />

    <!-- Yeux en amande -->
    <g v-if="mood === 'proud'" class="line">
      <path d="M73 76 Q83 81 93 76" />
      <path d="M127 76 Q117 81 107 76" />
    </g>
    <g v-else>
      <path class="iris outline" :d="eyes.left" />
      <path class="iris outline" :d="eyes.right" />
      <ellipse
        class="ink"
        :cx="85 + pupilShift.x"
        :cy="76 + pupilShift.y"
        rx="2"
        :ry="eyes.pupilRy"
      />
      <ellipse
        class="ink"
        :cx="115 + pupilShift.x"
        :cy="76 + pupilShift.y"
        rx="2"
        :ry="eyes.pupilRy"
      />
    </g>
    <path class="brow" :d="brows[mood]" />

    <!-- Bouche -->
    <path :class="mood === 'encouraging' ? 'mouth-open' : 'line'" :d="mouths[mood]" />

    <!-- Détails selon l'humeur -->
    <g v-if="mood === 'thinking'" class="thought">
      <circle cx="152" cy="58" r="3" />
      <circle cx="161" cy="46" r="4.5" />
      <circle cx="173" cy="31" r="7" />
    </g>
    <g v-if="mood === 'proud'" class="sparkles">
      <path d="M36 50 L39 60 L49 63 L39 66 L36 76 L33 66 L23 63 L33 60 Z" />
      <path d="M166 86 L168 93 L175 95 L168 97 L166 104 L164 97 L157 95 L164 93 Z" />
    </g>
    <path
      v-if="mood === 'encouraging'"
      class="flame"
      d="M166 74 C156 66 158 54 166 44 C166 52 172 54 174 48 C182 58 180 70 172 75 C170 76 168 76 166 74 Z"
    />
  </svg>
</template>

<style scoped>
.mascot {
  display: block;
  width: 100%;
  height: auto;
}

.fur {
  fill: var(--color-fox);
}
.fur-shade {
  fill: var(--color-fox-dark);
}
.fur-light {
  fill: var(--color-fur-light);
}
.ink,
.sock {
  fill: var(--color-ink);
}
.iris,
.marking {
  fill: var(--color-gold);
}
.ear-inner {
  fill: var(--color-ink-soft);
}
.scarf {
  fill: var(--color-vermilion);
}
.shadow {
  fill: var(--color-ink);
  opacity: 0.12;
}
.thought {
  fill: var(--color-ink-soft);
  opacity: 0.5;
}
.sparkles,
.flame {
  fill: var(--color-gold);
}
.mouth-open {
  fill: var(--color-vermilion);
  stroke: var(--color-ink);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.outline {
  stroke: var(--color-ink);
  stroke-width: 2.5;
  stroke-linejoin: round;
}
.contour {
  fill: none;
}
.line,
.brow {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 3;
  stroke-linecap: round;
}
.facet {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.5;
}
.brow {
  stroke: var(--color-gold);
  stroke-width: 3.5;
}

/* Petites animations douces (coupées par prefers-reduced-motion dans main.css) */
.tails {
  transform-box: view-box;
  transform-origin: 100px 170px;
  animation: sway 3s ease-in-out infinite alternate;
}
.ear {
  transform-box: view-box;
  transition: transform 0.3s ease;
}
.ear--left {
  transform-origin: 72px 50px;
}
.ear--right {
  transform-origin: 128px 50px;
}
.mascot--thinking .ear--right {
  transform: rotate(14deg);
}
.flame {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: flicker 1.2s ease-in-out infinite alternate;
}
/* La nouvelle queue pousse depuis sa base (origine du repère de la queue) */
.tail-new {
  transform-box: view-box;
  transform-origin: 0 0;
  animation: grow 1.2s ease-out 0.3s both;
}

@keyframes sway {
  from {
    transform: rotate(-3deg);
  }
  to {
    transform: rotate(3deg);
  }
}
@keyframes grow {
  from {
    transform: scale(0);
  }
  70% {
    transform: scale(1.12);
  }
  to {
    transform: scale(1);
  }
}
@keyframes flicker {
  from {
    transform: scale(1, 1);
  }
  to {
    transform: scale(0.92, 1.08);
  }
}
</style>
