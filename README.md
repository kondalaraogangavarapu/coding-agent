# coding-agent

An autonomous coding agent that writes/updates code, commits changes, and creates pull requests — powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript).

## Features

- **Interactive REPL** — Just run `coding-agent` in your repo and start typing tasks
- **Write & update code** — Describe what you want and the agent implements it
- **Git workflow** — `/commit` and `/pr` commands for staging, committing, pushing, and PRs
- **Full Claude Code toolset** — File read/write/edit, bash execution, glob/grep search
- **Git-aware** — Auto-detects branch, status, and repo context on startup

## Prerequisites

- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)
- `gh` CLI (optional, for `/pr` command)

## Setup

```bash
npm install
npm run build
export ANTHROPIC_API_KEY=your-api-key
```

## Usage

```bash
# Start the interactive agent in your project directory
cd your-project
coding-agent
```

You'll see a welcome screen with your repo context, then a prompt:

```
  coding-agent  — autonomous coding with Claude
────────────────────────────────────────────────────
  dir     your-project/
  branch  main
  commit  a1b2c3d latest commit message
  model   claude-sonnet-4-5-20250929
────────────────────────────────────────────────────

  Type a task and press Enter. The agent will
  read your code, make changes, commit, and more.

  Commands:  /commit  /pr  /status  /model  /help  /quit

> Add input validation to the signup form
```

### Tasks

Type any coding task in plain English:

```
> Add input validation to the signup form
> Fix the bug where users can't log out
> Refactor the database module to use connection pooling
> Write tests for the auth middleware
```

### Commands

| Command | Description |
|---|---|
| `/commit [message]` | Stage all changes & commit (auto-generates message if omitted) |
| `/pr [title]` | Push branch & create a pull request |
| `/status` | Show git status and recent commits |
| `/model [name]` | Show or change the Claude model |
| `/help` | Show help |
| `/quit` | Exit |

### Startup Flags

```bash
coding-agent --model claude-opus-4-20250514  # Use a different model
coding-agent --max-turns 100                  # Allow more turns per task
coding-agent --max-budget 5.00                # Cap spend at $5 per task
```

## Architecture

```
src/
├── index.ts    # Interactive REPL with slash commands
└── agent.ts    # Core agent logic, git context detection, streaming output
```

### How it works

1. On startup, `detectGitContext()` reads the repo's branch, last commit, dirty status, and remote URL
2. The REPL loop reads user input — plain text becomes a task, `/commands` get converted to structured prompts
3. `runAgent()` calls the Claude Agent SDK `query()` function, streaming tool calls and text in real time
4. The agent has access to `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `Task`, and `TodoWrite` tools
5. Results are printed with cost/turn/duration stats

## Programmatic Usage

```typescript
import { runAgent, printResult } from "./agent.js";

const result = await runAgent("Fix the login bug", {
  cwd: "/path/to/project",
});

if (result) printResult(result);
```
