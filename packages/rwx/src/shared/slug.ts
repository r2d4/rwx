export const slugify = (input: string): string => {
  const trimmed = input.trim().toLowerCase();
  let out = "";
  let prevDash = false;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    const isAlpha = code >= 97 && code <= 122;
    const isNum = code >= 48 && code <= 57;
    if (isAlpha || isNum) {
      out += char;
      prevDash = false;
      continue;
    }
    if (!prevDash) {
      out += "-";
      prevDash = true;
    }
  }
  let slug = out.replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    slug = "prompt";
  }
  if (slug.length > 100) {
    slug = slug.slice(0, 100);
  }
  return slug;
};

export const logLabelForRun = (slug: string): string => {
  const now = new Date();
  const pad = (value: number, size: number) => {
    const text = value.toString();
    if (text.length >= size) {
      return text;
    }
    return "0".repeat(size - text.length) + text;
  };
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(
    now.getUTCDate(),
    2,
  )}-${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(
    now.getUTCSeconds(),
    2,
  )}-${pad(now.getUTCMilliseconds(), 3)}`;
  if (slug.length === 0) {
    return stamp;
  }
  return `${stamp}-${slug}`;
};
