export const flagPresent = (args: string[], long: string, short: string): boolean => {
  for (const arg of args) {
    if (arg === long || arg.startsWith(`${long}=`)) {
      return true
    }
    if (short.length > 0) {
      if (arg === short) {
        return true
      }
      if (arg.startsWith(short) && arg.length > short.length && !arg.startsWith("--")) {
        return true
      }
    }
  }
  return false
}
