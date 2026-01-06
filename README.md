# rwx (ralph, wiggum, execute)

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/r2d4/rwx?style=social)](https://github.com/mattrickard/rwx/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Twitter Follow](https://img.shields.io/twitter/follow/mattrickard?style=social)](https://x.com/mattrickard)

</div>

<div align="center">
  <img src="./assets/rwx.jpeg" alt="rwx" width="300">
</div>

<div align="center">
  <h3>Autonomous "Ralph Loop" for AI agents </h3>
  <p>Define a task, specify success criteria, and let the agent iterate until it passes.</p>
</div>

```bash
rwx claude "fix failing tests" --verify "npm test"

rwx codex "add comprehensive JSDoc" \
  --verify-agent "All exported functions have complete documentation"

rwx claude --im-in-danger "port to the project to rust" --verify "cargo build"
```

---

## Overview

**rwx** runs AI agents in a dumb feedback loop with the same prompt and session against your verification criteria. Whether that's passing tests, satisfying type checks, or meeting subjective quality standards, the agent iterates until success—with each attempt saved as a git checkpoint.

Stop copying error messages between your terminal and chat interface. Define your success condition once, and let the agent find its way there.

## Installation

```bash
pnpm install -g @std-in/rwx
```

## Quick Start

From any git repository:

```bash
rwx claude "refactor the auth module" --verify "npm test && tsc --noEmit"
```

The agent will:
1. Attempt the task
2. Run your verification command or agent
4. Checkpoint each attempt in git
4. Check stop conditions (verification, limits, repeated errors)
5. Loop or finish.

## Examples

### Prompt with a file
Use the `--file` flag to provide a prompt file:
```bash
rwx claude -f prompt.md "refactor the auth module" --verify "npm test && tsc --noEmit"
```

### Bypass approvals/sandbox
Use the `--dangerous` flag to bypass approvals/sandbox:
```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  --dangerous
```
You can also use the `--im-in-danger` alias.

### Pass through arguments to the agents

Use the `--` flag to pass through arguments to the agents:
```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  -- --permission-mode dontAsk --sandbox danger-full-access
```

```bash
rwx codex "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  -- --model='gpt-5.1'
```

### Verifier agent

For subjective or complex criteria use the `--verify-agent` flag to provide a verifier agent prompt, which spawns a new agent to verify the task.
```bash
# Code quality checks
rwx claude "improve error handling" \
  --verify-agent "All error cases have descriptive messages and proper logging"
```
```bash
# Feature completeness
rwx claude "implement user settings page" \
  --verify-agent "Settings page includes profile, notifications, and privacy sections with working controls"
```

### Resume an agent session

Use the `--session-id` flag to resume an agent session:
```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  --session-id <session-id>
```

### Other limits

Use the `--max-iter` flag to limit the number of iterations:

```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  --max-iter 10
```

Use the `--max-mins` flag to limit the maximum runtime in minutes:

```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  --max-mins 10
```

Use the `--verify-timeout` flag to limit the verification command timeout in seconds:

```bash
rwx claude "refactor the auth module" \
  --verify "npm test && tsc --noEmit" \
  --verify-timeout 10
```

### Command-based Verification

Use any command that exits 0 on success:

```bash
# Run until tests pass
rwx claude "fix type errors in utils/" --verify "tsc --noEmit"

# Chain multiple checks
rwx claude "optimize database queries" \
  --verify "npm test && npm run lint && npm run build"

# Limit iterations
rwx claude "refactor payment processing" \
  --verify "npm test" \
  --max-iter 10
```

## Checkpoints

Every iteration creates a git checkpoint, giving you a complete audit trail:

```bash
# List all sessions
rwx checkpoints list

# List all checkpoints from a session
rwx checkpoints list <session-id>

# Restore a specific checkpoint
rwx checkpoints use <sha>
```

If the agent takes a wrong turn, simply roll back to any previous state.

## Configuration

### Logging

```bash
--log <path>             # Write detailed logs to file
--log-format json        # Structured JSON output
--log-level debug        # Verbose debugging information
```

## Why rwx?

**The problem:** AI agents can write code, but they can't see if it works. You end up in a loop—run checks, copy errors, paste them back, repeat.

**The solution:** Let the agent close its own loop. You define success, rwx handles the iteration.

**The benefit:**
- **Automated feedback** — No more manual copy-paste cycles
- **Verifiable results** — Success is defined by your criteria, not subjective judgment
- **Safe exploration** — Git checkpoints let you review or rollback any change
- **Reproducible workflows** — Turn ad-hoc debugging into repeatable processes

## CLI Reference

```bash
rwx [agent] "<task>" [options]
```

### Options

| Flag | Description |
|------|-------------|
| `-a, --agent <agent>` | Agent selector (claude\|codex) |
| `-f, --file <path>` | Path to prompt file |
| `-V, --verify <cmd>` | Shell command that exits 0 on success |
| `--verify-agent <prompt>` | Natural language verification criteria |
| `--verify-agent-file <path>` | Verifier agent prompt file |
| `--verify-shell <shell>` | Shell used to run `--verify` (default: /bin/bash) |
| `-t, --verify-timeout <N>` | Verification command timeout (seconds) |
| `-n, --max-iter <N>` | Maximum iteration limit |
| `-m, --max-mins <N>` | Maximum runtime (minutes) |
| `-T, --max-turns <N>` | Maximum turns per agent run |
| `--session-id <id>` | Resume previous session |
| `-l, --log <path>` | Log output file |
| `--log-format <format>` | Log format (text\|json) |
| `-v, --log-level <level>` | Log verbosity (debug\|info\|warn\|error) |
| `--dangerous` | Bypass approvals/sandbox |
| `--im-in-danger` | Bypass approvals/sandbox |
| `--` | Pass remaining arguments to the agent |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `command not found: rwx` | Ensure global install: `pnpm install -g @std-in/rwx` |
| `not a git repository` | Initialize git: `git init` |
| Agent commands fail | Verify agent CLI is installed and configured |

## License

MIT © [Matt Rickard](https://github.com/mattrickard)
