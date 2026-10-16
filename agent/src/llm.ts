// Minimal tool-use loop on Claude Haiku. The agent investigates with tools and must finish by calling
// its `submit_*` tool; the submitted object is returned along with the full investigation trace.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";

const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
export const MODEL = env("ANTHROPIC_MODEL", "claude-haiku-5-5");

export type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run?: (input: any) => Promise<unknown>;
};

export type TraceStep = { tool: string; input: unknown; output: unknown };

const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

export async function runAgent<T>(opts: {
  system: string;
  prompt: string;
  tools: Tool[];
  submitTool: string;
  maxTurns?: number;
  /** Called after each tool call, e.g. to stream investigation progress to the seller. */
  onStep?: (step: TraceStep) => void | Promise<void>;
}): Promise<{ result: T; trace: TraceStep[] }> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  const trace: TraceStep[] = [];
  const toolDefs = opts.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })) as Anthropic.Tool[];

  for (let turn = 0; turn < (opts.maxTurns ?? 10); turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: opts.system,
      tools: toolDefs,
      tool_choice: turn === (opts.maxTurns ?? 10) - 1 ? { type: "tool", name: opts.submitTool } : { type: "any" },
      messages,
    });
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const submit = uses.find((u) => u.name === opts.submitTool);
    if (submit) return { result: submit.input as T, trace };

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const tool = opts.tools.find((t) => t.name === u.name);
      let output: unknown;
      try {
        output = tool?.run ? await tool.run(u.input) : { error: `unknown tool ${u.name}` };
      } catch (e: any) {
        output = { error: e?.message ?? String(e) };
      }
      trace.push({ tool: u.name, input: u.input, output });
      await opts.onStep?.({ tool: u.name, input: u.input, output });
      results.push({ type: "tool_result", tool_use_id: u.id, content: ser(output).slice(0, 12000) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("agent did not submit a decision");
}
