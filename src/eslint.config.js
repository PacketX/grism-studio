import globals from "globals";

/* Minimal config aimed at one thing: catching references to names that don't
   exist. A missing identifier blanks the whole page at runtime, and that is not
   something the test suite can see. */
export default [
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: { "no-undef": "error", "no-dupe-keys": "error", "no-unreachable": "error" },
  },
];
