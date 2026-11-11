#!/usr/bin/env node
// PreToolUse guard: while the fix loop runs, the exam (fuzz corpus and the
// robustness harness) is read-only, so a fix can't pass by changing the test.
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

if (!existsSync(".claude/loop/active")) process.exit(0);
const input = JSON.parse(readFileSync(0, "utf8"));
const t = input.tool_input ?? {};
const targets = [t.file_path, t.notebook_path].filter(Boolean).map((p) => relative(process.cwd(), resolve(p)));
const cmd = String(t.command ?? "");
const locked = (p) => p.startsWith("tests/fuzz/") || p === "tests/robustness.test.ts";
const bashTouches = /tests\/fuzz\/|tests\/robustness\.test\.ts/.test(cmd) && /(>|\bsed\b|\brm\b|\bmv\b|\bcp\b|\btee\b|python|node -e|perl|git (checkout|restore))/.test(cmd);

if (targets.some(locked) || bashTouches) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "The fuzz corpus and robustness harness are locked during the fix loop. Fix the converter in src/ instead.",
      },
    }),
  );
}
