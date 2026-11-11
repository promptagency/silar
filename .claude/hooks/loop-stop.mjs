#!/usr/bin/env node
// Stop hook for the fix loop. Active only while .claude/loop/active exists
// (start the loop with `node .claude/hooks/loop.mjs start`). Each time Claude
// tries to stop, it runs the checks; if any fail, the stop is blocked and the
// failure tail is fed back. Ends on green checks or after MAX iterations.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ACTIVE = ".claude/loop/active";
const MAX = Number(process.env.LOOP_MAX_ITERATIONS ?? 20);
if (!existsSync(ACTIVE)) process.exit(0);

const state = JSON.parse(readFileSync(ACTIVE, "utf8"));
state.iteration = (state.iteration ?? 0) + 1;

const checks = ["npm test --silent", "npm run lint --silent", "npm run build --silent"];
for (const cmd of checks) {
  try {
    execSync(cmd, { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const failed = out.split("\n").filter((l) => /FAIL|✗|×|AssertionError|error/i.test(l)).slice(0, 40).join("\n");
    if (state.iteration >= MAX) {
      rmSync(ACTIVE);
      console.error(`Loop stopped after ${MAX} iterations with \`${cmd}\` still failing. Summarise what remains for the user.`);
      process.exit(0);
    }
    writeFileSync(ACTIVE, JSON.stringify(state));
    console.log(
      JSON.stringify({
        decision: "block",
        reason:
          `Iteration ${state.iteration}/${MAX}: \`${cmd}\` failed. Fix the cause in src/ (never edit tests/fuzz/ or tests/robustness.test.ts), then stop again.\n\n` +
          (failed || out.slice(-4000)),
      }),
    );
    process.exit(0);
  }
}
rmSync(ACTIVE);
console.error(`All checks green after ${state.iteration} iteration(s).`);
