import { Command } from "@oclif/core"

export default class VersionCommand extends Command {
  static summary = "Print version"

  async run(): Promise<void> {
    this.log(this.config.version)
  }
}
