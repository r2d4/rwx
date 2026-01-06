import { Args, Flags } from "@oclif/core"

export const runArgs = {
  prompt: Args.string({
    required: false,
    description: "prompt to run",
  }),
}

export const buildRunFlags = (includeAgent: boolean) => {
  const base = {
    file: Flags.string({
      char: "f",
      description: "path to prompt file",
    }),
    verify: Flags.string({
      char: "V",
      description: "verification command",
    }),
    "verify-agent": Flags.string({
      description: "verifier agent prompt",
    }),
    "verify-agent-file": Flags.string({
      description: "verifier agent prompt file",
    }),
    "max-iter": Flags.integer({
      char: "n",
      description: "max iterations",
    }),
    "max-mins": Flags.integer({
      char: "m",
      description: "max wall-clock minutes",
    }),
    "max-turns": Flags.integer({
      char: "T",
      description: "max turns per agent run",
    }),
    "session-id": Flags.string({
      description: "resume an existing session id",
    }),
    "verify-timeout": Flags.integer({
      char: "t",
      description: "verification timeout (seconds)",
    }),
    log: Flags.string({
      char: "l",
      description: "log file path",
    }),
    "log-format": Flags.string({
      options: ["text", "json"],
      description: "log format",
    }),
    "log-level": Flags.string({
      char: "v",
      options: ["debug", "info", "warn", "error"],
      description: "log level",
    }),
    dangerous: Flags.boolean({
      description: "bypass approvals/sandbox",
    }),
    "im-in-danger": Flags.boolean({
      description: "bypass approvals/sandbox",
    }),
    "verify-shell": Flags.string({
      description: "shell used to run --verify",
    }),
  }

  if (!includeAgent) {
    return base
  }

  return {
    agent: Flags.string({
      char: "a",
      options: ["claude", "codex"],
      description: "agent selector (claude|codex)",
    }),
    ...base,
  }
}
