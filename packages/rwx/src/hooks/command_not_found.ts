import { Help, type Hook } from "@oclif/core"

const hook: Hook.CommandNotFound = async (opts) => {
  if (opts.id === "help") {
    const help = new Help(opts.config, opts.config.pjson.oclif.helpOptions ?? opts.config.pjson.helpOptions)
    const argv = Array.isArray(opts.argv) ? opts.argv : []
    await help.showHelp(argv)
    return
  }
  const argv = Array.isArray(opts.argv) ? opts.argv : []
  const id = opts.id ?? ""
  const runArgv = id.length > 0 ? [id, ...argv] : argv
  return opts.config.runCommand("run", runArgv)
}

export default hook
