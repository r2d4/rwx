import type { Agent, LogFormat, LogLevel, RunConfig, VerifyMode } from "../model.ts"
import { rwxHomeDir } from "../shared/paths.ts"
import { err, ok, type Result } from "../shared/result.ts"
import path from "node:path"
import { z } from "zod/v4"

export type RunParsed = {
  config: RunConfig
  sessionId: string | null
  logExplicit: boolean
  maxIterExplicit: boolean
  maxMinsExplicit: boolean
}

export type RunConfigInput = {
  agent: Agent | null
  prompt: string
  promptFile: string | null
  verifyCmd: string | null
  verifyShell: string
  verifyAgentPrompt: string | null
  verifyAgentFile: string | null
  maxIter: number | null
  maxMins: number | null
  maxTurns: number | null
  sessionId: string | null
  verifyTimeoutSec: number | null
  logPath: string | null
  logFormat: string | null
  logLevel: string | null
  dangerous: boolean
  passThroughArgs: string[]
  logExplicit: boolean
  maxIterExplicit: boolean
  maxMinsExplicit: boolean
}

const inputSchema = z
  .object({
    agent: z.enum(["claude", "codex"]).nullable(),
    prompt: z.string(),
    promptFile: z.string().nullable(),
    verifyCmd: z.string().nullable(),
    verifyShell: z.string(),
    verifyAgentPrompt: z.string().nullable(),
    verifyAgentFile: z.string().nullable(),
    maxIter: z.number().int().nonnegative().nullable(),
    maxMins: z.number().int().nonnegative().nullable(),
    maxTurns: z.number().int().nonnegative().nullable(),
    sessionId: z.string().nullable(),
    verifyTimeoutSec: z.number().int().nonnegative().nullable(),
    logPath: z.string().nullable(),
    logFormat: z.enum(["text", "json"]).nullable(),
    logLevel: z.enum(["debug", "info", "warn", "error"]).nullable(),
    dangerous: z.boolean(),
    passThroughArgs: z.array(z.string()),
    logExplicit: z.boolean(),
    maxIterExplicit: z.boolean(),
    maxMinsExplicit: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.agent) {
      ctx.addIssue({
        code: "custom",
        message: "--agent is required (or use rwx claude/codex)",
      })
    }
    if (data.prompt.length > 0 && data.promptFile) {
      ctx.addIssue({
        code: "custom",
        message: "inline prompt and --file are mutually exclusive",
      })
    }
    if (data.prompt.length === 0 && !data.promptFile) {
      ctx.addIssue({
        code: "custom",
        message: "prompt is required (inline or --file)",
      })
    }
    if (data.verifyCmd && (data.verifyAgentPrompt || data.verifyAgentFile)) {
      ctx.addIssue({
        code: "custom",
        message: "--verify is mutually exclusive with --verify-agent/--verify-agent-file",
      })
    }
    if (data.verifyAgentPrompt && data.verifyAgentFile) {
      ctx.addIssue({
        code: "custom",
        message: "--verify-agent and --verify-agent-file are mutually exclusive",
      })
    }
  })

export const buildRunConfig = (input: RunConfigInput): Result<RunParsed> => {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return err(new Error(formatIssues(parsed.error)))
  }

  const data = parsed.data
  const agent: Agent = data.agent ?? "claude"
  let verifyMode: VerifyMode = "none"
  if (data.verifyAgentPrompt || data.verifyAgentFile) {
    verifyMode = "agent"
  } else if (data.verifyCmd) {
    verifyMode = "command"
  }

  const logFormat: LogFormat = data.logFormat ?? "text"
  const logLevel: LogLevel = data.logLevel ?? "info"

  const config: RunConfig = {
    agent,
    prompt: data.prompt,
    promptFile: data.promptFile,
    verifyMode,
    verifyCmd: data.verifyCmd,
    verifyShell: data.verifyShell.length > 0 ? data.verifyShell : "/bin/bash",
    verifyAgentPrompt: data.verifyAgentPrompt,
    verifyAgentPromptFile: data.verifyAgentFile,
    maxIterations: data.maxIter ?? 10,
    maxMinutes: data.maxMins ?? 30,
    maxTurns: data.maxTurns ?? 0,
    resumeSession: false,
    resumeVerifySession: false,
    verifyTimeoutSec: data.verifyTimeoutSec ?? 0,
    logPath: data.logPath ?? path.join(rwxHomeDir(), "log.log"),
    logFormat,
    logLevel,
    passThroughArgs: data.passThroughArgs,
    dangerouslyAllowAll: data.dangerous,
  }

  return ok({
    config,
    sessionId: data.sessionId,
    logExplicit: data.logExplicit,
    maxIterExplicit: data.maxIterExplicit,
    maxMinsExplicit: data.maxMinsExplicit,
  })
}

const formatIssues = (error: z.ZodError): string => {
  if (error.issues.length === 0) {
    return "invalid arguments"
  }
  if (error.issues.length === 1) {
    return error.issues[0]?.message ?? "invalid arguments"
  }
  return error.issues.map((issue) => issue.message).join("; ")
}
