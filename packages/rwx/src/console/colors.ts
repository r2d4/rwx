// ANSI color codes for terminal output

export const reset = "\u001b[0m";
export const dim = "\u001b[2m";
export const bold = "\u001b[1m";

// Colors
export const red = "\u001b[31m";
export const green = "\u001b[32m";
export const yellow = "\u001b[33m";
export const blue = "\u001b[34m";
export const magenta = "\u001b[35m";
export const cyan = "\u001b[36m";
export const white = "\u001b[37m";
export const gray = "\u001b[90m";

// Helper to wrap text with color (auto-reset)
export const c = (color: string, text: string): string => `${color}${text}${reset}`;

// Check if stream supports colors
export const supportsColor = (stream: NodeJS.WritableStream): boolean => {
  return "isTTY" in stream && Boolean(stream.isTTY);
};
