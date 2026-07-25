const js = require("@eslint/js")
const globals = require("globals")

module.exports = [
  {
    ...js.configs.recommended,
    files: ["**/*.js", "**/*.jsx"]
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.jasmine
      }
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
      "no-constant-condition": ["error", { checkLoops: false }],
      "linebreak-style": ["error", "unix"],
      "quotes": ["error", "double", { avoidEscape: true }]
    }
  }
]
