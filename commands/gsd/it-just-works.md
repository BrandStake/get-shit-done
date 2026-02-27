---
name: gsd:it-just-works
description: Fully autonomous milestone execution - plan, execute, verify, fix until done
argument-hint: "[--max-phases N] [--dry-run]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Task
  - TeamCreate
  - TeamDelete
  - TaskCreate
  - TaskUpdate
  - TaskList
  - SendMessage
---
<objective>
Execute an entire milestone autonomously with zero human intervention.

Purpose: Run the complete plan→execute→verify→fix cycle recursively until the milestone is complete. No stopping. No asking. No waiting. Just ship.

Output: Completed milestone with all phases executed, verified, and archived.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/it-just-works.md
</execution_context>

<context>
**Flags:**
- `--max-phases N` — Maximum phases to execute before stopping (default: 50, safety limit)
- `--dry-run` — Validate config and show what would run, but do not execute

**Prerequisites:**
- Project initialized with `/gsd:new-project`
- Milestone started with `/gsd:new-milestone`
- ROADMAP.md exists with phases defined
- Config set for autonomous operation (workflow validates this)

**What this command does:**
1. Validates config for fully autonomous operation
2. Finds next phase needing work (planning, execution, or verification)
3. Runs plan→execute→verify cycle
4. Auto-inserts fix phases for any issues found
5. Loops until all phases complete
6. Audits milestone completion
7. Creates fix phases for any audit gaps
8. Loops until audit passes
9. Archives completed milestone

**This command will NOT stop for:**
- User confirmation
- Plan approval
- Test responses
- Any interactive prompts

**This command WILL stop for:**
- Critical failures (build errors, missing dependencies)
- Max phase limit reached
- Milestone successfully completed
</context>

<process>
Execute the it-just-works workflow from @~/.claude/get-shit-done/workflows/it-just-works.md end-to-end.

You MUST NOT deviate from the workflow. You MUST NOT stop for user input. You MUST continue until completion or critical failure.
</process>
