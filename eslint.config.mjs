import config from "./packages/tool-config/eslint.config.mjs"

const rootIgnores = {
  ignores: ["**/node_modules/**", "**/dist/**", "**/.tsbuildinfo", "**/.rwx/**"],
}

export default [rootIgnores, ...config]
