import { Command } from "@oclif/core"
import { runArgs, buildRunFlags } from "../cli/run-flags.ts"
import { runFromCommand } from "../cli/run-command.ts"

export default class IndexCommand extends Command {
  static summary = "Run rwx"
  static strict = false
  static args = runArgs
  static flags = buildRunFlags(true)

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: IndexCommand.args,
      flags: IndexCommand.flags,
      strict: false,
      "--": true,
    })
    await runFromCommand({
      command: this,
      agentOverride: null,
      flags: parsed.flags,
      args: parsed.args,
      metadata: parsed.metadata,
      argv: this.argv,
      allowHelpOnEmpty: true,
    })
  }
}
