export const splitOnDoubleDash = (
  args: string[],
): { pre: string[]; pass: string[] } => {
  const index = args.indexOf("--");
  if (index < 0) {
    return { pre: args, pass: [] };
  }
  return { pre: args.slice(0, index), pass: args.slice(index + 1) };
};
