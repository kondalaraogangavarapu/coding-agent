import { query, type SDKMessage, type SDKResultMessage, type Options } from "@anthropic-ai/claude-agent-sdk";

export interface CodingAgentOptions {
  /** Working directory for the agent */
  cwd: string;
  /** Model to use (defaults to claude-sonnet-4-5-20250929) */
  model?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Whether to print streaming output */
  verbose?: boolean;
}

/**
 * Extracts text content from an SDK assistant message.
 */
function extractText(message: SDKMessage): string | null {
  if (message.type === "assistant" && message.message?.content) {
    const textParts: string[] = [];
    for (const block of message.message.content) {
      if ("text" in block && typeof block.text === "string") {
        textParts.push(block.text);
      }
    }
    return textParts.length > 0 ? textParts.join("\n") : null;
  }
  return null;
}

/**
 * Extracts tool use information from an SDK assistant message.
 */
function extractToolUse(message: SDKMessage): Array<{ name: string; input: unknown }> {
  const tools: Array<{ name: string; input: unknown }> = [];
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("name" in block && typeof block.name === "string") {
        tools.push({ name: block.name, input: "input" in block ? block.input : undefined });
      }
    }
  }
  return tools;
}

/**
 * Runs the Claude agent with the given prompt and options, streaming output.
 * Returns the final result message.
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
      append: `You are a coding agent. When you complete your task, always provide a clear summary of what you did.`,
    },
    allowedTools: [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "Task",
      "TodoWrite",
    ],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };

  let result: SDKResultMessage | null = null;

  for await (const message of query({ prompt, options: sdkOptions })) {
    if (options.verbose) {
      const text = extractText(message);
      if (text) {
        console.log(text);
      }

      const tools = extractToolUse(message);
      for (const tool of tools) {
        console.log(`  [tool] ${tool.name}`);
      }
    }

    if (message.type === "result") {
      result = message;
      if (message.subtype === "success") {
        if (options.verbose) {
          console.log(`\n--- Agent completed successfully ---`);
          console.log(`Turns: ${message.num_turns} | Cost: $${message.total_cost_usd.toFixed(4)}`);
        }
      } else {
        if (options.verbose) {
          console.error(`\n--- Agent finished with error: ${message.subtype} ---`);
        }
      }
    }

    if (message.type === "system" && "subtype" in message && message.subtype === "init") {
      if (options.verbose) {
        console.log(`Session initialized | Model: ${(message as any).model}`);
      }
    }
  }

  return result;
}

/**
 * Builds a prompt for the coding agent that instructs it to write/update code,
 * commit, and optionally create a PR.
 */
export function buildCodingPrompt(params: {
  task: string;
  branch?: string;
  commitMessage?: string;
  createPr?: boolean;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;
}): string {
  const parts: string[] = [];

  parts.push(`## Task\n\n${params.task}`);

  parts.push(`\n## Instructions\n`);
  parts.push(`1. Analyze the codebase to understand the existing structure and patterns.`);
  parts.push(`2. Implement the requested changes, writing clean, well-structured code.`);
  parts.push(`3. Verify your changes work correctly (run tests/linters if available).`);

  if (params.branch) {
    parts.push(`4. Create and switch to branch \`${params.branch}\` if not already on it.`);
  }

  const commitMsg = params.commitMessage || "Implement requested changes";
  parts.push(`5. Stage all relevant changed files and commit with message: "${commitMsg}"`);

  if (params.createPr) {
    const baseBranch = params.baseBranch || "main";
    parts.push(`6. Push the branch to origin.`);
    parts.push(`7. Create a pull request using \`gh pr create\`:`);
    if (params.prTitle) {
      parts.push(`   - Title: "${params.prTitle}"`);
    }
    if (params.prBody) {
      parts.push(`   - Body: "${params.prBody}"`);
    }
    parts.push(`   - Base branch: \`${baseBranch}\``);
    parts.push(`   - If \`gh\` is not available, provide the git commands to push and instructions for creating the PR manually.`);
  }

  parts.push(`\n## Guidelines\n`);
  parts.push(`- Follow existing code conventions and patterns in the repository.`);
  parts.push(`- Write minimal, focused changes — don't refactor unrelated code.`);
  parts.push(`- If you encounter errors, debug and fix them before committing.`);
  parts.push(`- Provide a clear summary of all changes made at the end.`);

  return parts.join("\n");
}
