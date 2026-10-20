/**
 * Vitest scope for this package.
 *
 * The plugin is developed from a checkout that may be nested inside a DSH
 * source tree; without this file Vitest walks up and picks the harness's root
 * config, whose `include` patterns do not match `plugins/**`, so `run` finds no
 * tests. Keeping the config package-local also makes the command in the
 * README/handoff reproduce exactly.
 */
export default {
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['node_modules/**', 'lib/**'],
    environment: 'node',
  },
}
