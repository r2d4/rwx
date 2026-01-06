import { Command } from "@oclif/core"
import { runArgs, buildRunFlags } from "../cli/run-flags.ts"
import { runFromCommand } from "../cli/run-command.ts"

export default class CodexCommand extends Command {
  static summary = "Run with Codex"
  static strict = false
  static args = runArgs
  static flags = buildRunFlags(false)

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: CodexCommand.args,
      flags: CodexCommand.flags,
      strict: false,
      "--": true,
    })
    await runFromCommand({
      command: this,
      agentOverride: "codex",
      flags: parsed.flags,
      args: parsed.args,
      metadata: parsed.metadata,
      argv: this.argv,
      allowHelpOnEmpty: false,
    })
  }
}
