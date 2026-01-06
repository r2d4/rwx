import { Args, Command, Flags } from "@oclif/core"
import { listCheckpoints } from "../../cli/checkpoints.ts"

export default class CheckpointsListCommand extends Command {
  static summary = "List checkpoints"
  static args = {
    session: Args.string({
      required: false,
      description: "session id (prefix ok) to list iterations",
    }),
  }
  static flags = {
    "session-id": Flags.string({
      char: "s",
      description: "session id (prefix ok) to list iterations",
    }),
    json: Flags.boolean({
      char: "j",
      description: "output JSON",
    }),
  }

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: CheckpointsListCommand.args,
      flags: CheckpointsListCommand.flags,
    })
    const result = await listCheckpoints({
      session: parsed.args.session ?? parsed.flags["session-id"] ?? null,
      json: parsed.flags.json === true,
    })
    if (!result.ok) {
      this.error(result.error.message)
    }
  }
}
