// OpenAI-compatible streaming (Server-Sent Events) → text deltas, tool calls,
// reasoning, finish. Pure: no DOM, no fetch, no app state — feed it the
// decoded chunks of a /v1/chat/completions stream, in order.
export function aiSSE(state, chunk) { // OpenAI-style SSE → text deltas; state = {buf: ""}; vm-testable on strings
  state.buf += chunk;
  const out = [];
  const lines = state.buf.split("\n");
  state.buf = lines.pop();
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("data:")) continue;
    const d = t.slice(5).trim();
    if (d === "[DONE]") { state.done = true; continue; }
    let j;
    try { j = JSON.parse(d); } catch (err) { continue; }
    const c = j.choices && j.choices[0];
    const txt = c && c.delta && c.delta.content;
    if (typeof txt === "string" && txt) out.push(txt);
    const think = c && c.delta && (c.delta.reasoning_content || c.delta.reasoning); // LM Studio streams Qwen's thinking apart; count it so the wait is visible
    if (typeof think === "string") {
      state.think = (state.think || 0) + think.length;
      // the bridge sends whole steps ("using Bash npm test… "); LM Studio sends
      // thinking in fragments — only a whole step becomes the visible note
      if (/^using .+…\s*$/.test(think)) state.note = think.replace(/^using /, "").replace(/…\s*$/, "").trim();
    }
    const tc = c && c.delta && c.delta.tool_calls; // OpenAI tools: name once, arguments in pieces, one slot per index
    if (Array.isArray(tc)) {
      state.tools = state.tools || [];
      for (const t of tc) {
        const i = t.index || 0;
        const slot = state.tools[i] || (state.tools[i] = {id: "", name: "", args: ""});
        if (t.id) slot.id = t.id;
        if (t.function && t.function.name) slot.name += t.function.name;
        if (t.function && typeof t.function.arguments === "string") slot.args += t.function.arguments;
      }
    }
    if (c && c.finish_reason) state.finish = c.finish_reason;
    if (j.error && j.error.message) state.error = j.error.message;
  }
  return out;
}
