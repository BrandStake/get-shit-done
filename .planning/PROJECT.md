# GSD (Get Shit Done)

## What This Is

A meta-prompting, context engineering, and spec-driven development system for Claude Code, OpenCode, and Gemini CLI. It solves context rot by orchestrating specialized subagents with fresh context windows, managing state across sessions, and ensuring atomic commits with verification at each phase.

## Core Value

Give Claude everything it needs to do the work AND verify it - no manual context management, no quality degradation, no guessing.

## Requirements

### Validated

- Multi-agent orchestration with thin orchestrators spawning specialized agents (v1.0-v1.20)
- Phase-based development workflow with atomic commits (v1.0)
- Context engineering with PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md (v1.0)
- Wave-based parallel execution with dependency graphs (v1.4)
- Goal-backward verification with gsd-verifier (v1.5.7)
- Research phase with 4 parallel researchers (v1.5.0)
- Quick mode for ad-hoc tasks (v1.7.0)
- Model profiles (quality/balanced/budget) (v1.9.0)
- gsd-tools CLI for deterministic operations (v1.12-v1.17)
- Cross-platform support: Claude Code, OpenCode, Gemini CLI (v1.10)

### Active

- [ ] Hybrid agent team execution with VoltAgent integration

### Out of Scope

- Real-time collaboration features — single-user focus
- GUI/web interface — CLI-first design
- Custom model training — uses existing Claude models

## Current Milestone: v1.21 Hybrid Agent Team Execution

**Goal:** Modify GSD's execution workflow so gsd-executor delegates tasks to specialized VoltAgent subagents based on task domain, creating a "team" of experts instead of one generalist executor.

**Target features:**
- Task domain analysis to identify required specialists
- Integration with VoltAgent subagent plugins (127+ specialists)
- Hybrid coordination layer (gsd-executor + multi-agent-coordinator)
- Specialist reporting format compatible with GSD state management
- Preserved GSD guarantees: atomic commits, deviation rules, checkpoints

## Context

**VoltAgent plugins installed globally:**
- voltagent-core-dev, voltagent-lang, voltagent-infra, voltagent-qa-sec, voltagent-data-ai
- voltagent-dev-exp, voltagent-domains, voltagent-biz, voltagent-meta, voltagent-research

**Example specialists:**
- python-pro, typescript-pro, golang-pro (language experts)
- kubernetes-specialist, docker-expert, terraform-engineer (infra)
- security-engineer, penetration-tester (security)
- postgres-pro, database-optimizer (data)
- multi-agent-coordinator, workflow-orchestrator (coordination)

**Current execution flow:**
```
execute-phase orchestrator
    ↓
spawns gsd-executor per plan (generalist)
    ↓
executes all tasks regardless of domain
```

**Target execution flow (with adapter layers):**
```
execute-phase orchestrator (unchanged)
    ↓
gsd-executor (maintains GSD state awareness)
    ↓
gsd-task-adapter (translates GSD task → specialist prompt)
    ↓
multi-agent-coordinator (from voltagent-meta)
    ↓
specialist (python-pro, typescript-pro, etc.)
    ↓
gsd-result-adapter (translates output → GSD completion format)
    ↓
gsd-executor (commits, updates state)
```

**Adapter benefits:** Clean separation, reusable, testable, easier to extend

## Constraints

- **Backward compatibility**: Existing workflows must continue working
- **GSD state management**: gsd-executor must remain the entry point to preserve STATE.md, PLAN.md, deviation rules, checkpoints, atomic commits
- **VoltAgent availability**: Specialists only available when plugins installed globally
- **Graceful fallback**: If specialist unavailable, gsd-executor handles task directly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| gsd-executor as coordinator | Preserves GSD guarantees (state, commits, deviations) | ✓ Good |
| Use multi-agent-coordinator | VoltAgent provides coordination expertise | ✓ Good |
| Adapter pattern (task + result) | Clean separation, reusable, testable | ✓ Good |
| Domain detection in executor | Task context available at execution time | — Pending |

---
*Last updated: 2026-02-22 after milestone v1.21 initialization*
