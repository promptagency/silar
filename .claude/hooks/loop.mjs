#!/usr/bin/env node
// node .claude/hooks/loop.mjs start | stop | status
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ACTIVE = ".claude/loop/active";
const cmd = process.argv[2];
if (cmd === "start") {
  mkdirSync(".claude/loop", { recursive: true });
  writeFileSync(ACTIVE, JSON.stringify({ iteration: 0, started: new Date().toISOString() }));
  console.log("Loop armed. Ask Claude to fix the failing robustness cases; it can't stop until checks are green.");
} else if (cmd === "stop") {
  rmSync(ACTIVE, { force: true });
  console.log("Loop disarmed.");
} else {
  console.log(existsSync(ACTIVE) ? `Active: ${readFileSync(ACTIVE, "utf8")}` : "Not active.");
}
