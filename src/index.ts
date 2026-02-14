#!/usr/bin/env node

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runAgent, buildCodingPrompt } from "./agent.js";

function printUsage(): void {
  console.log(`
coding-agent - An autonomous coding agent powered by Claude

USAGE:
  coding-agent --task <description> [options]
  coding-agent --prompt <raw-prompt> [options]

REQUIRED (one of):
  --task, -t <text>       High-level task description (agent builds the full prompt)
  --prompt, -p <text>     Raw prompt sent directly to the agent

OPTIONS:
  --cwd, -d <path>        Working directory (default: current directory)
  --branch, -b <name>     Git branch to create/switch to before committing
  --commit-msg, -m <msg>  Commit message (default: "Implement requested changes")
  --create-pr             Create a pull request after committing
  --pr-title <text>       Pull request title
  --pr-body <text>        Pull request body/description
  --base-branch <name>    Base branch for PR (default: "main")
  --model <id>            Claude model to use (default: claude-sonnet-4-5-20250929)
  --max-turns <n>         Max conversation turns (default: 50)
  --max-budget <usd>      Max budget in USD
  --verbose, -v           Print agent streaming output
  --help, -h              Show this help message

ENVIRONMENT:
  ANTHROPIC_API_KEY       Required. Your Anthropic API key.

EXAMPLES:
  # Simple code task
  coding-agent --task "Add input validation to the signup form" --verbose

  # Full workflow: code, commit, and PR
  coding-agent \\
    --task "Add rate limiting to the API endpoints" \\
    --branch "feature/rate-limiting" \\
    --commit-msg "feat: add rate limiting to API endpoints" \\
    --create-pr \\
    --pr-title "Add rate limiting" \\
    --verbose

  # Direct prompt (full control)
  coding-agent --prompt "Read main.py and add type hints to all functions. Then commit." --verbose
`);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        task: { type: "string", short: "t" },
        prompt: { type: "string", short: "p" },
        cwd: { type: "string", short: "d" },
        branch: { type: "string", short: "b" },
        "commit-msg": { type: "string", short: "m" },
        "create-pr": { type: "boolean", default: false },
        "pr-title": { type: "string" },
        "pr-body": { type: "string" },
        "base-branch": { type: "string" },
        model: { type: "string" },
        "max-turns": { type: "string" },
        "max-budget": { type: "string" },
        verbose: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    console.error('Run "coding-agent --help" for usage information.');
    process.exit(1);
  }

  const { values } = parsed;

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (!values.task && !values.prompt) {
    console.error("Error: Either --task or --prompt is required.");
    console.error('Run "coding-agent --help" for usage information.');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    console.error("Get your API key at https://console.anthropic.com/");
    process.exit(1);
  }

  const cwd = values.cwd ? resolve(values.cwd) : process.cwd();

  // Build the prompt
  let agentPrompt: string;
  if (values.prompt) {
    agentPrompt = values.prompt;
  } else {
    agentPrompt = buildCodingPrompt({
      task: values.task!,
      branch: values.branch,
      commitMessage: values["commit-msg"],
      createPr: values["create-pr"],
      prTitle: values["pr-title"],
      prBody: values["pr-body"],
      baseBranch: values["base-branch"],
    });
  }

  if (values.verbose) {
    console.log("=".repeat(60));
    console.log("Coding Agent Starting");
    console.log("=".repeat(60));
    console.log(`Working directory: ${cwd}`);
    console.log(`Model: ${values.model || "claude-sonnet-4-5-20250929"}`);
    if (values.branch) console.log(`Branch: ${values.branch}`);
    if (values["create-pr"]) console.log("Will create PR: yes");
    console.log("=".repeat(60));
    console.log();
  }

  const result = await runAgent(agentPrompt, {
    cwd,
    model: values.model,
    maxTurns: values["max-turns"] ? parseInt(values["max-turns"], 10) : undefined,
    maxBudgetUsd: values["max-budget"] ? parseFloat(values["max-budget"]) : undefined,
    verbose: values.verbose,
  });

  if (!result) {
    console.error("Agent returned no result.");
    process.exit(1);
  }

  if (result.subtype === "success") {
    console.log("\n" + "=".repeat(60));
    console.log("RESULT");
    console.log("=".repeat(60));
    console.log(result.result);
    console.log("=".repeat(60));
    console.log(`Turns: ${result.num_turns} | Cost: $${result.total_cost_usd.toFixed(4)}`);
  } else {
    console.error("\nAgent encountered an error:", result.subtype);
    if ("errors" in result && result.errors) {
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
