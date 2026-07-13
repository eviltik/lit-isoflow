import js from '@eslint/js';
import lit from 'eslint-plugin-lit';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  lit.configs['flat/recommended'],
  prettier,
  {
    files: ['src/**/*.js', 'demo/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        customElements: 'readonly',
        HTMLElement: 'readonly',
        Node: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        XMLSerializer: 'readonly',
        ResizeObserver: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
