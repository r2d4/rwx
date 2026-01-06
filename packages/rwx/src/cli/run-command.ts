import type { Command } from "@oclif/core"
import { Help } from "@oclif/core"
import type { Agent } from "../model.ts"
import { splitOnDoubleDash } from "./args.ts"
import { buildRunConfig } from "./run-config.ts"
import { runWithConfig } from "./run.ts"
import { z } from "zod/v4"

export const runFromCommand = async (input: {
  command: Command
  agentOverride: Agent | null
  flags: Record<string, unknown>
  args: Record<string, unknown>
  argv: string[]
  metadata: { flags: Record<string, { setFromDefault?: boolean } | undefined> }
  allowHelpOnEmpty: boolean
}): Promise<void> => {
  const split = splitOnDoubleDash(input.argv)
  const pass = split.pass

  if (input.allowHelpOnEmpty && input.argv.length === 0) {
    await showHelp(input.command, [])
    return
  }

  const parsedInput = runInputSchema.safeParse({
    flags: input.flags,
    args: input.args,
    agentOverride: input.agentOverride,
  })
  if (!parsedInput.success) {
    const commandId = input.command.id ?? "run"
    await showHelp(input.command, [commandId])
    input.command.error(formatIssues(parsedInput.error))
  }

  const configInput = {
    ...parsedInput.data,
    ...explicitFlags(input.metadata.flags, input.flags),
    passThroughArgs: pass,
  }
  const parsed = buildRunConfig(configInput)
  if (!parsed.ok) {
    const commandId = input.command.id ?? "run"
    await showHelp(input.command, [commandId])
    input.command.error(parsed.error.message)
  }

  const result = await runWithConfig(parsed.value)
  if (!result.ok) {
    input.command.error(result.error.message)
  }
}

const showHelp = async (command: Command, argv: string[]): Promise<void> => {
  const help = new Help(command.config, command.config.pjson.oclif.helpOptions ?? command.config.pjson.helpOptions)
  await help.showHelp(argv)
}

const optionalString = z.union([z.string(), z.null()]).optional().default(null)
const optionalInt = z.union([z.number().int().nonnegative(), z.null()]).optional().default(null)
const optionalLogFormat = z.union([z.enum(["text", "json"]), z.null()]).optional().default(null)
const optionalLogLevel = z
  .union([z.enum(["debug", "info", "warn", "error"]), z.null()])
  .optional()
  .default(null)
const optionalAgent = z.union([z.enum(["claude", "codex"]), z.null()]).optional().default(null)

const agentSchema = z.union([z.literal("claude"), z.literal("codex")]).nullable()
const flagsSchema = z
  .object({
    file: optionalString,
    verify: optionalString,
    "verify-agent": optionalString,
    "verify-agent-file": optionalString,
    "max-iter": optionalInt,
    "max-mins": optionalInt,
    "max-turns": optionalInt,
    "session-id": optionalString,
    "verify-timeout": optionalInt,
    log: optionalString,
    "log-format": optionalLogFormat,
    "log-level": optionalLogLevel,
    dangerous: z.boolean().optional().default(false),
    "im-in-danger": z.boolean().optional().default(false),
    "verify-shell": z.string().optional().default("/bin/bash"),
    agent: optionalAgent,
  })
  .strict()

const argsSchema = z.object({
  prompt: z.string().optional().default(""),
})

const runInputSchema = z
  .object({
    flags: flagsSchema,
    args: argsSchema,
    agentOverride: agentSchema,
  })
  .transform((value) => {
    const rawFlags = value.flags
    const agent =
      value.agentOverride ??
      (rawFlags.agent === "claude" || rawFlags.agent === "codex" ? rawFlags.agent : null)
    return {
      agent,
      prompt: value.args.prompt,
      promptFile: rawFlags.file,
      verifyCmd: rawFlags.verify,
      verifyShell: rawFlags["verify-shell"],
      verifyAgentPrompt: rawFlags["verify-agent"],
      verifyAgentFile: rawFlags["verify-agent-file"],
      maxIter: rawFlags["max-iter"],
      maxMins: rawFlags["max-mins"],
      maxTurns: rawFlags["max-turns"],
      sessionId: rawFlags["session-id"],
      verifyTimeoutSec: rawFlags["verify-timeout"],
      logPath: rawFlags.log,
      logFormat: rawFlags["log-format"],
      logLevel: rawFlags["log-level"],
      dangerous: rawFlags.dangerous || rawFlags["im-in-danger"],
    }
  })

const formatIssues = (error: z.ZodError): string => {
  if (error.issues.length === 0) {
    return "invalid arguments"
  }
  if (error.issues.length === 1) {
    return error.issues[0]?.message ?? "invalid arguments"
  }
  return error.issues.map((issue) => issue.message).join("; ")
}

const explicitFlags = (
  metadata: Record<string, { setFromDefault?: boolean } | undefined>,
  flags: Record<string, unknown>,
): { logExplicit: boolean; maxIterExplicit: boolean; maxMinsExplicit: boolean } => {
  const logExplicit = !metadata.log?.setFromDefault && flags.log !== undefined
  const maxIterExplicit =
    !metadata["max-iter"]?.setFromDefault && flags["max-iter"] !== undefined
  const maxMinsExplicit =
    !metadata["max-mins"]?.setFromDefault && flags["max-mins"] !== undefined
  return { logExplicit, maxIterExplicit, maxMinsExplicit }
}
