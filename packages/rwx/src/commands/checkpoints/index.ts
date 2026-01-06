import { Command } from "@oclif/core"

export default class CheckpointsCommand extends Command {
  static summary = "Inspect checkpoints"

  async run(): Promise<void> {
    const [subcommand, ...rest] = this.argv
    if (subcommand === "list" || subcommand === "use") {
      await this.config.runCommand(`checkpoints:${subcommand}`, rest)
      return
    }
    await this.config.runCommand("help", ["checkpoints"])
  }
}
