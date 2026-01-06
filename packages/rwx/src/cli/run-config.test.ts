import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildRunConfig, type RunConfigInput } from "./run-config.ts"
import { rwxHomeDir } from "../shared/paths.ts"

const baseInput: RunConfigInput = {
  agent: "claude",
  prompt: "do the thing",
  promptFile: null,
  verifyCmd: null,
  verifyShell: "/bin/bash",
  verifyAgentPrompt: null,
  verifyAgentFile: null,
  maxIter: null,
  maxMins: null,
  maxTurns: null,
  sessionId: null,
  verifyTimeoutSec: null,
  logPath: null,
  logFormat: null,
  logLevel: null,
  dangerous: false,
  passThroughArgs: [],
  logExplicit: false,
  maxIterExplicit: false,
  maxMinsExplicit: false,
}

describe("buildRunConfig", () => {
  it("errors when agent is missing", () => {
    const result = buildRunConfig({ ...baseInput, agent: null })
    expect(result.ok).toBe(false)
  })

  it("errors when prompt is missing", () => {
    const result = buildRunConfig({ ...baseInput, prompt: "" })
    expect(result.ok).toBe(false)
  })

  it("errors when prompt and file are both set", () => {
    const result = buildRunConfig({ ...baseInput, promptFile: "prompt.txt" })
    expect(result.ok).toBe(false)
  })

  it("errors when verify command and verify agent are both set", () => {
    const result = buildRunConfig({
      ...baseInput,
      verifyCmd: "go test ./...",
      verifyAgentPrompt: "verify it",
    })
    expect(result.ok).toBe(false)
  })

  it("defaults fields when valid", () => {
    const result = buildRunConfig({ ...baseInput })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    expect(result.value.config.maxIterations).toBe(10)
    expect(result.value.config.maxMinutes).toBe(30)
    expect(result.value.config.maxTurns).toBe(0)
    expect(result.value.config.verifyTimeoutSec).toBe(0)
    expect(result.value.config.logPath).toBe(path.join(rwxHomeDir(), "log.log"))
    expect(result.value.config.logFormat).toBe("text")
    expect(result.value.config.logLevel).toBe("info")
  })

  it("sets verify mode to command", () => {
    const result = buildRunConfig({ ...baseInput, verifyCmd: "go test ./..." })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    expect(result.value.config.verifyMode).toBe("command")
  })

  it("sets verify mode to agent", () => {
    const result = buildRunConfig({ ...baseInput, verifyAgentPrompt: "verify it" })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    expect(result.value.config.verifyMode).toBe("agent")
  })

  it("defaults verify shell when empty", () => {
    const result = buildRunConfig({ ...baseInput, verifyShell: "" })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    expect(result.value.config.verifyShell).toBe("/bin/bash")
  })

  it("accepts explicit log format and level", () => {
    const result = buildRunConfig({
      ...baseInput,
      logFormat: "json",
      logLevel: "debug",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    expect(result.value.config.logFormat).toBe("json")
    expect(result.value.config.logLevel).toBe("debug")
  })

  it("errors on invalid log format", () => {
    const result = buildRunConfig({ ...baseInput, logFormat: "nope" })
    expect(result.ok).toBe(false)
  })

  it("errors on negative max iter", () => {
    const result = buildRunConfig({ ...baseInput, maxIter: -1 })
    expect(result.ok).toBe(false)
  })
})
