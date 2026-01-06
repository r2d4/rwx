export type Agent = "claude" | "codex";

export type VerifyMode = "none" | "command" | "agent";

export type LogFormat = "text" | "json";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type RunConfig = {
  agent: Agent;
  prompt: string;
  promptFile: string | null;
  verifyMode: VerifyMode;
  verifyCmd: string | null;
  verifyShell: string;
  verifyAgentPrompt: string | null;
  verifyAgentPromptFile: string | null;
  maxIterations: number;
  maxMinutes: number;
  maxTurns: number;
  resumeSession: boolean;
  resumeVerifySession: boolean;
  verifyTimeoutSec: number;
  logPath: string;
  logFormat: LogFormat;
  logLevel: LogLevel;
  passThroughArgs: string[];
  dangerouslyAllowAll: boolean;
};

export type SessionState = {
  sessionId: string;
  agent: Agent;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  claude: ClaudeMeta | null;
  codex: CodexMeta | null;
};

export type ClaudeMeta = {
  transcriptPath: string;
  verifySessionId: string;
  verifyTranscriptPath: string;
};

export type CodexMeta = {
  sessionFile: string;
  verifySessionId: string;
  verifySessionFile: string;
};

export type AgentResult = {
  exitCode: number;
};

export type VerifyResult = {
  exitCode: number;
  timedOut: boolean;
  outputTail: string;
};

export type CheckpointRef = {
  ref: string;
  shortSha: string;
  iteration: number;
  timestamp: string;
  sessionId: string;
  verifyExitCode: number;
  verifyTimedOut: boolean;
  verifyMode: string;
  verifyOutput: string;
};

export type RunResult = {
  status: string;
  iterations: number;
  elapsedMs: number;
  lastVerifyExitCode: number;
  lastCheckpointRef: string;
};
