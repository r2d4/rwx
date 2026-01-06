import { Args, Command, Flags } from "@oclif/core"
import { useCheckpoint } from "../../cli/checkpoints.ts"

export default class CheckpointsUseCommand extends Command {
  static summary = "Checkout a checkpoint ref"
  static args = {
    ref: Args.string({
      required: true,
      description: "checkpoint ref or iteration",
    }),
  }
  static flags = {
    "session-id": Flags.string({
      char: "s",
      description: "session id for bare iteration",
    }),
  }

  async run(): Promise<void> {
    const parsed = await this.parse({
      args: CheckpointsUseCommand.args,
      flags: CheckpointsUseCommand.flags,
    })
    const result = await useCheckpoint({
      ref: parsed.args.ref,
      sessionId: parsed.flags["session-id"] ?? null,
    })
    if (!result.ok) {
      this.error(result.error.message)
    }
  }
}
