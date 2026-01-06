import { Command } from "@oclif/core"
import { runArgs, buildRunFlags } from "../cli/run-flags.ts"
import { runFromCommand } from "../cli/run-command.ts"

export default class ClaudeCommand extends Command {
  static summary = "Run with Claude"
  static strict = false
  static args = runArgs
  static flags = buildRunFlags(false)

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: ClaudeCommand.args,
      flags: ClaudeCommand.flags,
      strict: false,
      "--": true,
    })
    await runFromCommand({
      command: this,
      agentOverride: "claude",
      flags: parsed.flags,
      args: parsed.args,
      metadata: parsed.metadata,
      argv: this.argv,
      allowHelpOnEmpty: false,
    })
  }
}
