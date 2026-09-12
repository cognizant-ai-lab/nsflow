
/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // A leading underscore means "deliberately unused": a signature that has to
      // match a callee's shape, or the destructure-to-omit idiom
      // (`const { [key]: _dropped, ...rest } = obj`), which needs a binding it
      // never reads. Without this, the only way to keep those is a disable comment
      // on every line.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Deliberately a warning, not an error, and this is a debt rather than a
      // preference. There are ~108 of these, almost all on genuinely dynamic JSON
      // reaching the UI: streamed sly_data, progress payloads, the JSON editor's
      // callbacks. `unknown` is the right type for nearly all of them, but it only
      // pays off with narrowing added at each use site, and those sites live in
      // features with no test coverage. Keeping the rule on as a warning means lint
      // can run in CI and catch everything else, including any NEW error, instead of
      // being switched off wholesale because of this one rule.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
