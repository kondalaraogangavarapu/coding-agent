#!/usr/bin/env node

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { detectGitContext, runAgent, printResult, type GitContext } from "./agent.js";

// ── ANSI ────────────────────────────────────────────────────────────────────
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";

// ── Parse optional flags ────────────────────────────────────────────────────
function parseFlags() {
  try {
    return parseArgs({
      options: {
        model: { type: "string" },
        "max-turns": { type: "string" },
        "max-budget": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }).values;
  } catch {
    return { help: false } as Record<string, string | boolean | undefined>;
  }
}

// ── Welcome banner ──────────────────────────────────────────────────────────
function printBanner(cwd: string, git: GitContext, model: string): void {
  const dir = basename(cwd);
  console.log();
  console.log(`${BOLD}${CYAN}  coding-agent${RESET}  ${DIM}— autonomous coding with Claude${RESET}`);
  console.log(`${DIM}${"─".repeat(52)}${RESET}`);
  console.log(`  ${DIM}dir${RESET}     ${dir}/`);
  if (git.isGitRepo) {
    console.log(`  ${DIM}branch${RESET}  ${GREEN}${git.branch}${RESET}`);
    if (git.lastCommit) {
      console.log(`  ${DIM}commit${RESET}  ${git.lastCommit}`);
    }
    if (git.hasUncommitted) {
      console.log(`  ${DIM}status${RESET}  ${YELLOW}uncommitted changes${RESET}`);
    }
  } else {
    console.log(`  ${DIM}git${RESET}     ${YELLOW}not a git repo${RESET}`);
  }
  console.log(`  ${DIM}model${RESET}   ${model}`);
  console.log(`${DIM}${"─".repeat(52)}${RESET}`);
  console.log();
  console.log(`  Type a task and press ${BOLD}Enter${RESET}. The agent will`);
  console.log(`  read your code, make changes, search the web, and more.`);
  console.log();
  console.log(`  ${DIM}Commands:  /commit  /pr  /status  /search  /model  /help  /quit${RESET}`);
  console.log();
}

function printHelp(): void {
  console.log(`
${BOLD}Tasks${RESET}
  Just type what you want done in plain English:

    ${DIM}>${RESET} Add input validation to the signup form
    ${DIM}>${RESET} Fix the bug where users can't log out
    ${DIM}>${RESET} Refactor the database module to use connection pooling
    ${DIM}>${RESET} Write tests for the auth middleware
    ${DIM}>${RESET} Look up the latest React Router API and update our routes

${BOLD}Commands${RESET}
  ${CYAN}/commit${RESET} ${DIM}[message]${RESET}  Stage & commit changes (auto-generates message if omitted)
  ${CYAN}/pr${RESET} ${DIM}[title]${RESET}      Push branch & create a pull request
  ${CYAN}/status${RESET}          Show git status
  ${CYAN}/search${RESET} ${DIM}<query>${RESET}  Search the web for docs, APIs, or solutions
  ${CYAN}/model${RESET} ${DIM}[name]${RESET}    Show or change the model
  ${CYAN}/help${RESET}            Show this help
  ${CYAN}/quit${RESET}            Exit

${BOLD}Startup flags${RESET}
  --model <id>        Claude model (default: claude-sonnet-4-5-20250929)
  --max-turns <n>     Max turns per task (default: 50)
  --max-budget <usd>  Max USD per task
`);
}

// ── Slash commands ──────────────────────────────────────────────────────────
function buildSlashPrompt(input: string, git: GitContext): string | null {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]!.toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "/commit": {
      const msg = arg || "auto-generate a concise commit message from the staged diff";
      return [
        `Run \`git add -A\` to stage all changes.`,
        `Then commit with message: "${msg}".`,
        arg ? "" : "Look at the diff to write a good commit message.",
        `Show the resulting \`git log -1\` at the end.`,
      ].filter(Boolean).join("\n");
    }

    case "/pr": {
      const title = arg || "auto-generate a title from the commits on this branch";
      return [
        `Push the current branch to origin.`,
        `Then create a pull request using \`gh pr create\`:`,
        `  - Title: "${title}"`,
        arg ? "" : "  - Generate the title and body from the branch commits.",
        `  - Base: main`,
        `If \`gh\` is unavailable, show the manual steps.`,
      ].filter(Boolean).join("\n");
    }

    case "/status":
      return "Run `git status` and `git log --oneline -5` and show me the output.";

    case "/search": {
      if (!arg) return "Ask me what to search for — I can look up documentation, APIs, error messages, and more on the web.";
      return `Search the web for: "${arg}". Summarize the most relevant results and suggest how they apply to this project.`;
    }

    default:
      return null;
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const flags = parseFlags();

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${RED}Error: ANTHROPIC_API_KEY is not set.${RESET}`);
    console.error(`Get your key at https://console.anthropic.com/`);
    process.exit(1);
  }

  const cwd = process.cwd();
  let model = (flags.model as string) || "claude-sonnet-4-5-20250929";
  const maxTurns = flags["max-turns"] ? parseInt(flags["max-turns"] as string, 10) : 50;
  const maxBudgetUsd = flags["max-budget"] ? parseFloat(flags["max-budget"] as string) : undefined;

  const git = detectGitContext(cwd);
  printBanner(cwd, git, model);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const prompt = `${BLUE}>${RESET} `;

  let taskNum = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let input: string;
    try {
      input = await rl.question(prompt);
    } catch {
      // ctrl-d / closed
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;

    // ── built-in commands ──
    if (trimmed === "/quit" || trimmed === "/exit" || trimmed === "/q") {
      console.log(`${DIM}Goodbye.${RESET}`);
      break;
    }

    if (trimmed === "/help" || trimmed === "/?") {
      printHelp();
      continue;
    }

    if (trimmed.startsWith("/model")) {
      const arg = trimmed.slice(6).trim();
      if (arg) {
        model = arg;
        console.log(`${DIM}Model set to ${model}${RESET}`);
      } else {
        console.log(`${DIM}Current model: ${model}${RESET}`);
      }
      continue;
    }

    // ── slash → prompt conversion ──
    let agentPrompt: string;
    if (trimmed.startsWith("/")) {
      const converted = buildSlashPrompt(trimmed, git);
      if (!converted) {
        console.log(`${YELLOW}Unknown command: ${trimmed.split(/\s/)[0]}${RESET}`);
        console.log(`${DIM}Type /help for available commands.${RESET}`);
        continue;
      }
      agentPrompt = converted;
    } else {
      agentPrompt = trimmed;
    }

    taskNum++;
    console.log(`\n${DIM}── task ${taskNum} ${"─".repeat(42)}${RESET}\n`);

    const result = await runAgent(agentPrompt, {
      cwd,
      model,
      maxTurns,
      maxBudgetUsd,
    });

    if (result) {
      printResult(result);
    } else {
      console.log(`${RED}No result returned from agent.${RESET}`);
    }

    console.log();
  }

  rl.close();
}

main().catch((err) => {
  console.error(`${RED}Fatal:${RESET}`, err);
  process.exit(1);
});
