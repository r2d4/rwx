import { isString } from "./guards.ts";
import type { ApprovalMode, SandboxMode } from "@openai/codex-sdk";

export type ExtraArgValue = string | null;

export type ParsedExtraArgs = {
  args: Record<string, ExtraArgValue>;
  hasPermissionMode: boolean;
  hasAllowDangerous: boolean;
  approvalPolicy: string | null;
  sandboxMode: string | null;
};

const stripPrefix = (value: string, prefix: string): string => {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

export const parseExtraArgs = (input: string[]): ParsedExtraArgs => {
  const args: Record<string, ExtraArgValue> = {};
  let hasPermissionMode = false;
  let hasAllowDangerous = false;
  let approvalPolicy: string | null = null;
  let sandboxMode: string | null = null;

  let i = 0;
  while (i < input.length) {
    const current = input[i] ?? "";
    if (!current.startsWith("--")) {
      i += 1;
      continue;
    }
    const trimmed = stripPrefix(current, "--");
    const [key, inlineValue] = splitOnce(trimmed, "=");
    let value: ExtraArgValue = null;
    if (inlineValue.length > 0) {
      value = inlineValue;
    } else if (i + 1 < input.length) {
      const next = input[i + 1];
      if (isString(next) && !next.startsWith("-")) {
        value = next;
        i += 1;
      }
    }
    args[key] = value;
    if (key === "permission-mode") {
      hasPermissionMode = true;
    }
    if (key === "allow-dangerously-skip-permissions") {
      hasAllowDangerous = true;
    }
    if (key === "ask-for-approval" && value && value.length > 0) {
      approvalPolicy = value;
    }
    if (key === "sandbox" && value && value.length > 0) {
      sandboxMode = value;
    }
    i += 1;
  }

  return { args, hasPermissionMode, hasAllowDangerous, approvalPolicy, sandboxMode };
};

export const toApprovalMode = (value: string | null): ApprovalMode | null => {
  if (value === "never") {
    return "never";
  }
  if (value === "on-request") {
    return "on-request";
  }
  if (value === "on-failure") {
    return "on-failure";
  }
  if (value === "untrusted") {
    return "untrusted";
  }
  return null;
};

export const toSandboxMode = (value: string | null): SandboxMode | null => {
  if (value === "read-only") {
    return "read-only";
  }
  if (value === "workspace-write") {
    return "workspace-write";
  }
  if (value === "danger-full-access") {
    return "danger-full-access";
  }
  return null;
};

const splitOnce = (value: string, sep: string): [string, string] => {
  const idx = value.indexOf(sep);
  if (idx < 0) {
    return [value, ""];
  }
  return [value.slice(0, idx), value.slice(idx + sep.length)];
};
