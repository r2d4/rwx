import js from "@eslint/js"
import tseslint from "typescript-eslint"

const tsFiles = ["packages/**/*.{ts,tsx}"]

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.tsbuildinfo", "**/.rwx/**"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: tsFiles,
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
)
