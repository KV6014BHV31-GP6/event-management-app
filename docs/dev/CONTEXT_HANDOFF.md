# Context checkpoint and resume guide

Status: working-baseline. Owner: Benjamin Dev workflow. This guide supports the canonical [AGENTS](../../AGENTS.md), [CURRENT](CURRENT.md) and active task. It is not another functional-status page and grants no permission.

## Bounded retrieval

Start with CURRENT → active task → relevant contract/requirements and nearby README/config/package files. Use source/document registers to locate a specific receipt. Search by task ID, source namespace, path or full SHA and read the relevant section before expanding to logs or archives. Do not bulk-load historical transcripts or treat private model memory as factual repository evidence. Record an unresolved question before retrieving more context.

Use full branch/SHA identity to keep main shell, remote dev, isolated verification and preserved local checkout separate. Before resuming, re-read actual Git status/refs and current user scope. If the tree, writer or ref changed, compare and reconcile before editing. A checkpoint records what was known at its timestamp, not what is necessarily true now.

## Structured checkpoint template

Copy this into the active task at a meaningful boundary or before context loss. Use ISO timestamps with `+08:00` (UTC+8); record UTC separately if a tool emits it.

```text
Checkpoint time:
Repository / absolute worktree:
Working branch / full HEAD:
Base branch / full SHA / last remote observation:
Current user objective and explicit authorization:
Out of scope / pending approval:
Primary writer and allowed paths:
Dirty paths / files changed since previous checkpoint:
Sources: source IDs, full feature namespaces, paths and original hashes:
Contract/runtime/database versions:
Changes completed and decisions with reasons:
Commands: exact command, cwd, exit code, expected vs observed:
Evidence: sanitized paths/links, tested SHA, result and limitations:
Historical failures retained / successor outcome:
Open questions / blockers / missing inputs:
Next actions (maximum three):
Safe resume point and first read-only command:
Delivery: local commit, reread remote SHA, PR base/head/URL, reviewer:
```

## Evidence discipline

Separate observed repository facts, contributor reports, local checks, real integration and named human acceptance. Retain FAIL, BLOCKED and NOT_RUN entries; append a successor rather than overwriting a failed attempt. A passed check belongs to its tested bytes/environment. Before relating it to another commit, identify the comparison and its limitations; do not promote a PASS across branches automatically.

Never place secrets, connection credentials, tokens, Authorization headers, real personal/health data or private sharing URLs in a checkpoint. Record environment-variable names and sanitized evidence only. Durable rules and historical authorization records are not current permission for merges, deployment, paid calls or messages.

The final handoff states the smallest next action, the evidence needed to resolve it, who owns affected files and which operations still need user authorization. Keep CURRENT concise and update it only with a material status change; keep detailed command history in the task/evidence record.
