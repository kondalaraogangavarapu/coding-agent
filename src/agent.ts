import { query, type SDKMessage, type SDKResultMessage, type Options } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CodingAgentOptions {
  cwd: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export interface GitContext {
  isGitRepo: boolean;
  branch: string;
  repoRoot: string;
  remoteUrl: string;
  hasUncommitted: boolean;
  lastCommit: string;
}

/** Detect git context from a directory. */
export function detectGitContext(cwd: string): GitContext {
  const fallback: GitContext = {
    isGitRepo: false,
    branch: "",
    repoRoot: cwd,
    remoteUrl: "",
    hasUncommitted: false,
    lastCommit: "",
  };

  if (!existsSync(join(cwd, ".git"))) return fallback;

  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } catch {
      return "";
    }
  };

  return {
    isGitRepo: true,
    branch: run("git rev-parse --abbrev-ref HEAD"),
    repoRoot: run("git rev-parse --show-toplevel"),
    remoteUrl: run("git remote get-url origin"),
    hasUncommitted: run("git status --porcelain") !== "",
    lastCommit: run("git log -1 --oneline"),
  };
}

/** Format a duration in ms to a human-readable string. */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ANSI helpers
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

/**
 * Runs the coding agent for a single task, printing live streaming output.
 */
export async function runAgent(
  prompt: string,
  options: CodingAgentOptions
): Promise<SDKResultMessage | null> {
  const sdkOptions: Options = {
    cwd: options.cwd,
    model: options.model || "claude-sonnet-4-5-20250929",
    maxTurns: options.maxTurns || 50,
    maxBudgetUsd: options.maxBudgetUsd,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [
        "You are an autonomous coding agent.",
        "You can read, write, and edit files, run shell commands, search code, and manage git workflows.",
        "When you finish a task, provide a concise summary of what you changed.",
      ].join(" "),
    },
    allowedTools: [
      "Read", "Write", "Edit", "Bash",
      "Glob", "Grep", "Task", "TodoWrite",
    ],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };

  let result: SDKResultMessage | null = null;

  for await (const message of query({ prompt, options: sdkOptions })) {
    // --- assistant text ---
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && typeof block.text === "string") {
          process.stdout.write(block.text + "\n");
        }
        if ("name" in block && typeof block.name === "string") {
          const name = block.name;
          const input = "input" in block ? block.input as Record<string, unknown> : {};
          const detail = formatToolDetail(name, input);
          process.stdout.write(`${DIM}  -> ${name}${detail}${RESET}\n`);
        }
      }
    }

    // --- result ---
    if (message.type === "result") {
      result = message;
    }

    // --- init ---
    if (message.type === "system" && "subtype" in message && message.subtype === "init") {
      const m = message as any;
      process.stdout.write(`${DIM}[session ${m.session_id?.slice(0, 8) ?? "?"} | model ${m.model ?? "?"}]${RESET}\n\n`);
    }
  }

  return result;
}

function formatToolDetail(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Bash":
      return input.command ? ` ${DIM}$ ${String(input.command).slice(0, 80)}${RESET}` : "";
    case "Read":
    case "Write":
    case "Edit":
      return input.file_path ? ` ${String(input.file_path)}` : "";
    case "Glob":
      return input.pattern ? ` ${String(input.pattern)}` : "";
    case "Grep":
      return input.pattern ? ` /${String(input.pattern)}/` : "";
    default:
      return "";
  }
}

export function printResult(result: SDKResultMessage): void {
  console.log();
  if (result.subtype === "success") {
    const cost = result.total_cost_usd.toFixed(4);
    const dur = fmtDuration(result.duration_ms);
    console.log(`${GREEN}${BOLD}Done${RESET} ${DIM}(${result.num_turns} turns, $${cost}, ${dur})${RESET}`);
  } else {
    console.log(`${RED}${BOLD}Error: ${result.subtype}${RESET}`);
    if ("errors" in result && result.errors) {
      for (const e of result.errors) {
        console.log(`${RED}  ${e}${RESET}`);
      }
    }
  }
}
