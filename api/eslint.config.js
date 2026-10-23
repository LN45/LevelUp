import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['.wrangler/**', 'worker-configuration.d.ts']),
  tseslint.configs.recommended,
)
