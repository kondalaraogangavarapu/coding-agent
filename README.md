# coding-agent

An autonomous coding agent that writes/updates code, commits changes, and creates pull requests — powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript).

## Features

- **Write & update code** — Describe what you want and the agent implements it autonomously
- **Git workflow** — Automatically stages, commits, and pushes changes
- **Pull requests** — Creates PRs with title/body via `gh` CLI
- **Full Claude Code toolset** — File read/write/edit, bash execution, glob/grep search
- **Configurable** — Control model, budget, turn limits, and verbosity

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- `gh` CLI (optional, for creating pull requests)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd coding-agent
npm install

# Build
npm run build

# Set your API key
export ANTHROPIC_API_KEY=your-api-key
```

## Usage

```bash
# Simple code task
node dist/index.js --task "Add input validation to the signup form" --verbose

# Full workflow: code, commit, and PR
node dist/index.js \
  --task "Add rate limiting to the API endpoints" \
  --branch "feature/rate-limiting" \
  --commit-msg "feat: add rate limiting to API endpoints" \
  --create-pr \
  --pr-title "Add rate limiting" \
  --verbose

# Direct prompt (full control over what the agent does)
node dist/index.js --prompt "Read main.py and add type hints to all functions, then commit." --verbose
```

## CLI Options

| Option | Short | Description |
|---|---|---|
| `--task <text>` | `-t` | High-level task description |
| `--prompt <text>` | `-p` | Raw prompt sent directly to the agent |
| `--cwd <path>` | `-d` | Working directory (default: current directory) |
| `--branch <name>` | `-b` | Git branch to create/switch to |
| `--commit-msg <msg>` | `-m` | Commit message |
| `--create-pr` | | Create a PR after committing |
| `--pr-title <text>` | | PR title |
| `--pr-body <text>` | | PR body/description |
| `--base-branch <name>` | | Base branch for PR (default: `main`) |
| `--model <id>` | | Claude model (default: `claude-sonnet-4-5-20250929`) |
| `--max-turns <n>` | | Max conversation turns (default: 50) |
| `--max-budget <usd>` | | Max budget in USD |
| `--verbose` | `-v` | Print streaming output |
| `--help` | `-h` | Show help |

## Architecture

```
src/
├── index.ts    # CLI entry point with argument parsing
└── agent.ts    # Core agent logic using Claude Agent SDK
```

### How it works

1. **`index.ts`** parses CLI arguments, validates inputs, and builds configuration
2. **`agent.ts`** contains two key exports:
   - `buildCodingPrompt()` — Constructs a structured prompt from task parameters (branch, commit message, PR details)
   - `runAgent()` — Invokes the Claude Agent SDK's `query()` function, streaming messages and returning the final result

The agent uses Claude Code's built-in tools (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `Task`, `TodoWrite`) to autonomously explore the codebase, implement changes, and run git/gh commands.

## Programmatic Usage

You can also use the agent as a library:

```typescript
import { runAgent, buildCodingPrompt } from "./agent.js";

const prompt = buildCodingPrompt({
  task: "Fix the login bug where sessions expire too early",
  branch: "fix/session-expiry",
  commitMessage: "fix: extend session TTL to 24 hours",
  createPr: true,
  prTitle: "Fix session expiry bug",
});

const result = await runAgent(prompt, {
  cwd: "/path/to/project",
  verbose: true,
});

if (result?.subtype === "success") {
  console.log("Done:", result.result);
}
```
