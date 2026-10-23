import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeView from '@/views/HomeView.vue'

describe('HomeView', () => {
  it("affiche le nom de l'appli", () => {
    expect(mount(HomeView).text()).toContain('LevelUp')
  })
})
