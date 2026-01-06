#!/usr/bin/env node
import { run } from "@oclif/core"

run(undefined, import.meta.url).catch((error) => {
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`)
  }
  process.exit(1)
})
