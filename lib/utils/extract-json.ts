/**
 * Extract the first complete JSON object from a string (e.g. an LLM response).
 *
 * Robust to: ```json fences (with or without closing fence), pre/post chatter
 * ("Here's the JSON: {...} hope this helps"), trailing whitespace, etc.
 * Scans for the first '{' and walks to the matching '}', respecting strings
 * and escapes. Returns null if no balanced object is found.
 *
 * Used by backend Anthropic callers (POI narrative, vision tagger) to salvage
 * a JSON body from a chat-shaped response. Kept dependency-free so it works
 * anywhere.
 */
export function extractJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
