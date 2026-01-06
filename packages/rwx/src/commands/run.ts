import { Command } from "@oclif/core"
import { runArgs, buildRunFlags } from "../cli/run-flags.ts"
import { runFromCommand } from "../cli/run-command.ts"

export default class RunCommand extends Command {
  static summary = "Run an agent loop"
  static strict = false
  static args = runArgs
  static flags = buildRunFlags(true)

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: RunCommand.args,
      flags: RunCommand.flags,
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
      allowHelpOnEmpty: false,
    })
  }
}
