import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 全形空格（U+3000）用於顯示文字的排版，不是程式碼裡的意外空白
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true }],
      // `_` 開頭＝刻意保留不用的參數（store 工廠的 `_session`、測試的 `_name`）
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      /*
       * 開發期 HMR 的規則，與正確性無關。元件與它的工具（`BagCell` 的格子與 tooltip、
       * `LogWindow` 的位置工具）刻意放同一個檔案，為了它拆檔只會把相關的東西打散。
       */
      'react-refresh/only-export-components': 'off',
    },
  },
])
