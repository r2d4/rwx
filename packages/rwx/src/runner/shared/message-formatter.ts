import type {
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ThreadEvent, ThreadItem } from "@openai/codex-sdk";
import { getRecordValue, getStringValue, isRecord, isString } from "../../shared/guards.ts";
import * as colors from "../../console/colors.ts";

export type FormattedMessage = {
  chunks: string[];
  debug: Record<string, unknown>;
  sessionId: string | null;
};

export type MessageFormatter<T> = {
  format: (message: T) => FormattedMessage;
};

export const createClaudeMessageFormatter = (opts?: {
  color?: boolean;
  maxContentLength?: number;
}): MessageFormatter<SDKMessage> => {
  const seenById = new Map<string, string>();
  const color = opts?.color ?? false;
  const maxContent = opts?.maxContentLength ?? 240;

  const format = (message: SDKMessage): FormattedMessage => {
    const debug = baseClaudeDebug(message);
    const sessionId = sessionIdFromMessage(message);
    if (message.type === "assistant") {
      const { text, blocks } = assistantContent(message.message);
      const id = messageId(message) ?? "assistant";
      const chunk = deltaForId(id, text, seenById);
      const chunks: string[] = [];
      if (chunk) {
        chunks.push(formatBlock("assistant", "claude", splitLines(chunk), color, false, "cyan"));
      }
      for (const block of blocks) {
        const blockColor = block.type === "tool_use" ? "yellow" : "magenta";
        chunks.push(formatBlock(block.type, "claude", block.lines, color, true, blockColor));
      }
      return { chunks, debug, sessionId };
    }
    if (message.type === "stream_event") {
      return { chunks: [], debug, sessionId };
    }
    if (message.type === "result") {
      return {
        chunks: formatResultMessage(message, color, maxContent),
        debug,
        sessionId,
      };
    }
    if (message.type === "system") {
      return {
        chunks: formatSystemMessage(message, color),
        debug,
        sessionId,
      };
    }
    if (message.type === "user") {
      return {
        chunks: formatUserMessage(message, color, maxContent),
        debug,
        sessionId,
      };
    }
    if (message.type === "auth_status") {
      return {
        chunks: [
          formatBlock(
            "auth_status",
            "claude",
            normalizeStringArray(message.output),
            color,
            true,
            "blue",
          ),
        ],
        debug,
        sessionId,
      };
    }
    return { chunks: [], debug, sessionId };
  };

  return { format };
};

export const createCodexMessageFormatter = (opts?: {
  color?: boolean;
}): MessageFormatter<ThreadEvent> => {
  const seenById = new Map<string, string>();
  const color = opts?.color ?? false;

  const format = (event: ThreadEvent): FormattedMessage => {
    const debug = baseCodexDebug(event);
    const sessionId = threadIdFromEvent(event);

    if (
      event.type === "item.started" ||
      event.type === "item.updated" ||
      event.type === "item.completed"
    ) {
      const item = event.item;
      const itemType = itemTypeFromItem(item);
      const chunk = itemDelta(item, seenById);
      if (chunk) {
        const msgColor = itemType === "tool_use" ? "yellow" : "cyan";
        return {
          chunks: [formatBlock(itemType, "codex", splitLines(chunk), color, false, msgColor)],
          debug,
          sessionId,
        };
      }
      return { chunks: [], debug, sessionId };
    }

    if (event.type === "error") {
      const message = getStringValue(event as unknown as Record<string, unknown>, "error");
      if (message) {
        return {
          chunks: [formatBlock("error", "codex", [message], color, false, "red")],
          debug,
          sessionId,
        };
      }
      return { chunks: [], debug, sessionId };
    }

    return { chunks: [], debug, sessionId };
  };

  return { format };
};

const baseClaudeDebug = (message: SDKMessage): Record<string, unknown> => {
  const debug: Record<string, unknown> = {
    message_type: message.type,
  };
  if ("subtype" in message && message.subtype) {
    debug.subtype = message.subtype;
  }
  const uuid = messageId(message);
  if (uuid) {
    debug.uuid = uuid;
  }
  const sessionId = sessionIdFromMessage(message);
  if (sessionId) {
    debug.session_id = sessionId;
  }
  return debug;
};

const baseCodexDebug = (event: ThreadEvent): Record<string, unknown> => {
  const debug: Record<string, unknown> = {
    event_type: event.type,
  };
  if ("thread_id" in event && typeof event.thread_id === "string") {
    debug.thread_id = event.thread_id;
  }
  if ("turn_id" in event && typeof event.turn_id === "string") {
    debug.turn_id = event.turn_id;
  }
  if ("item" in event && isRecord(event.item)) {
    const item = event.item as Record<string, unknown>;
    if (typeof item.type === "string") {
      debug.item_type = item.type;
    }
    if (typeof item.id === "string") {
      debug.item_id = item.id;
    }
  }
  return debug;
};

const assistantText = (message: unknown): string => {
  if (!isRecord(message)) {
    return "";
  }
  const content = getRecordValue(message, "content");
  if (isString(content)) {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }
    if (getRecordValue(block, "type") !== "text") {
      continue;
    }
    const text = getRecordValue(block, "text");
    if (isString(text)) {
      parts.push(text);
    }
  }
  return parts.join("");
};

const assistantContent = (
  message: unknown,
): { text: string; blocks: Array<{ type: string; lines: string[] }> } => {
  if (!isRecord(message)) {
    return { text: "", blocks: [] };
  }
  const content = getRecordValue(message, "content");
  if (typeof content === "string") {
    return { text: content, blocks: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", blocks: [] };
  }
  const texts: string[] = [];
  const blocks: Array<{ type: string; lines: string[] }> = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }
    const blockType = getRecordValue(block, "type");
    if (blockType === "text") {
      const textValue = getRecordValue(block, "text");
      if (isString(textValue)) {
        texts.push(textValue);
      }
      continue;
    }
    const type = isString(blockType) ? blockType : "unknown";
    blocks.push({
      type,
      lines: summarizeBlock(block),
    });
  }
  return { text: texts.join(""), blocks };
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter(isString);
  }
  if (isString(value)) {
    return [value];
  }
  return [];
};

const formatSystemMessage = (message: SDKMessage, color: boolean): string[] => {
  if (message.type !== "system") {
    return [];
  }
  const subtype = isRecord(message) && typeof message.subtype === "string" ? message.subtype : "system";
  const lines: string[] = [];
  if (subtype === "init" && isRecord(message)) {
    const model = getStringValue(message, "model");
    const cwd = getStringValue(message, "cwd");
    const permission = getStringValue(message, "permissionMode");
    const outputStyle = getStringValue(message, "output_style");
    const tools = getRecordValue(message, "tools");
    const mcp = getRecordValue(message, "mcp_servers");
    const slash = getRecordValue(message, "slash_commands");
    if (model) lines.push(`model=${model}`);
    if (cwd) lines.push(`cwd=${cwd}`);
    if (permission) lines.push(`permission=${permission}`);
    if (outputStyle) lines.push(`output_style=${outputStyle}`);
    if (Array.isArray(tools)) lines.push(`tools=${tools.length}`);
    if (Array.isArray(mcp)) lines.push(`mcp_servers=${mcp.length}`);
    if (Array.isArray(slash)) lines.push(`slash_commands=${slash.length}`);
  } else if (subtype === "compact_boundary" && isRecord(message)) {
    const meta = getRecordValue(message, "compact_metadata");
    if (isRecord(meta)) {
      const trigger = getStringValue(meta, "trigger");
      const preTokens = getRecordValue(meta, "pre_tokens");
      if (trigger) lines.push(`trigger=${trigger}`);
      if (typeof preTokens === "number") lines.push(`pre_tokens=${preTokens}`);
    }
  }
  return [formatBlock(`system:${subtype}`, "claude", lines, color, true, "blue")];
};

const formatUserMessage = (
  message: SDKMessage,
  color: boolean,
  maxLength: number,
): string[] => {
  if (message.type !== "user") {
    return [];
  }
  const content = isRecord(message) ? getRecordValue(message, "message") : null;
  const text = content ? assistantText(content) : "";
  const lines: string[] = [];
  if (text) {
    lines.push(truncate(text, maxLength));
  } else {
    lines.push("(no text)");
  }
  return [formatBlock("user", "claude", lines, color, false, "green")];
};

const formatResultMessage = (
  message: SDKResultMessage,
  color: boolean,
  maxLength: number,
): string[] => {
  if (message.type !== "result") {
    return [];
  }
  const subtype =
    "subtype" in message && typeof message.subtype === "string"
      ? message.subtype
      : "result";
  const lines: string[] = [];
  if ("num_turns" in message && typeof message.num_turns === "number") {
    lines.push(`turns=${message.num_turns}`);
  }
  if ("duration_ms" in message && typeof message.duration_ms === "number") {
    lines.push(`duration_ms=${message.duration_ms}`);
  }
  if ("total_cost_usd" in message && typeof message.total_cost_usd === "number") {
    lines.push(`cost_usd=${message.total_cost_usd}`);
  }
  if ("result" in message && typeof message.result === "string") {
    lines.push(`result=${truncate(message.result, maxLength)}`);
  }
  if ("errors" in message && Array.isArray(message.errors)) {
    const errs = message.errors.filter(isString).map((err) => truncate(err, maxLength));
    if (errs.length > 0) {
      lines.push(`errors=${errs.join(" | ")}`);
    }
  }
  if ("permission_denials" in message && Array.isArray(message.permission_denials)) {
    lines.push(`permission_denials=${message.permission_denials.length}`);
  }
  return [formatBlock(`result:${subtype}`, "claude", lines, color, true, "magenta")];
};

const summarizeBlock = (block: Record<string, unknown>): string[] => {
  const lines: string[] = [];
  const name = getStringValue(block, "name") ?? getStringValue(block, "tool_name");
  if (name) {
    lines.push(`name=${name}`);
  }
  const id = getStringValue(block, "id") ?? getStringValue(block, "tool_use_id");
  if (id) {
    lines.push(`id=${id}`);
  }
  const isError = getRecordValue(block, "is_error");
  if (typeof isError === "boolean") {
    lines.push(`is_error=${isError}`);
  }
  const input = getRecordValue(block, "input");
  if (input !== undefined) {
    lines.push(`input=${truncate(JSON.stringify(input), 160)}`);
  }
  const content = getRecordValue(block, "content");
  if (content !== undefined) {
    lines.push(`content=${truncate(JSON.stringify(content), 160)}`);
  }
  if (lines.length === 0) {
    lines.push("(no details)");
  }
  return lines;
};

type MessageColor = "cyan" | "green" | "yellow" | "red" | "magenta" | "blue";

const colorCodes: Record<MessageColor, string> = {
  cyan: colors.cyan,
  green: colors.green,
  yellow: colors.yellow,
  red: colors.red,
  magenta: colors.magenta,
  blue: colors.blue,
};

const formatBlock = (
  messageType: string,
  agent: string,
  lines: string[],
  color: boolean,
  indent: boolean,
  msgColor: MessageColor = "cyan",
): string => {
  const typeText = color ? colors.c(colorCodes[msgColor], messageType) : messageType;
  const agentText = color ? colors.c(colors.dim, `[${agent}]`) : `[${agent}]`;
  const header = `${typeText} ${agentText}`;
  if (lines.length === 0) {
    return `${header}\n\n`;
  }
  const body = indent
    ? lines.map((line) => `  ${line}`).join("\n")
    : lines.join("\n");
  const mutedBody = color ? colors.c(colors.dim, body) : body;
  return `${header}\n${mutedBody}\n\n`;
};

const truncate = (value: string, max: number): string => {
  if (max <= 0 || value.length <= max) {
    return value;
  }
  if (max <= 3) {
    return value.slice(0, max);
  }
  return `${value.slice(0, max - 3)}...`;
};

const splitLines = (value: string): string[] => {
  if (!value) {
    return [];
  }
  return value.replace(/\r\n/g, "\n").split("\n");
};


const messageId = (message: SDKMessage): string | null => {
  if (isRecord(message) && typeof message.uuid === "string") {
    return message.uuid;
  }
  return null;
};

const sessionIdFromMessage = (message: SDKMessage): string | null => {
  if (isRecord(message) && typeof message.session_id === "string") {
    return message.session_id;
  }
  return null;
};


const deltaForId = (id: string, full: string, seen: Map<string, string>): string => {
  const prev = seen.get(id) ?? "";
  seen.set(id, full);
  if (full.startsWith(prev)) {
    return full.slice(prev.length);
  }
  return full;
};

const itemDelta = (item: ThreadItem, seen: Map<string, string>): string => {
  if (!("id" in item) || typeof item.id !== "string") {
    return "";
  }
  const text = itemText(item);
  if (!text) {
    return "";
  }
  const prev = seen.get(item.id) ?? "";
  let chunk = text;
  if (text.startsWith(prev)) {
    chunk = text.slice(prev.length);
  }
  seen.set(item.id, text);
  return chunk;
};

const itemText = (item: ThreadItem): string => {
  if ("text" in item && typeof item.text === "string") {
    return item.text;
  }
  if ("aggregated_output" in item && typeof item.aggregated_output === "string") {
    return item.aggregated_output;
  }
  if ("message" in item && typeof item.message === "string") {
    return item.message;
  }
  if ("output" in item && typeof item.output === "string") {
    return item.output;
  }
  return "";
};

const itemTypeFromItem = (item: ThreadItem): string => {
  if ("type" in item && typeof item.type === "string") {
    return item.type;
  }
  return "message";
};

const threadIdFromEvent = (event: ThreadEvent): string | null => {
  if ("thread_id" in event && typeof event.thread_id === "string") {
    return event.thread_id;
  }
  return null;
};
