# GSD (Get Shit Done)

## What This Is

A meta-prompting, context engineering, and spec-driven development system for Claude Code, OpenCode, and Gemini CLI. It solves context rot by orchestrating specialized subagents with fresh context windows, managing state across sessions, and ensuring atomic commits with verification at each phase.

## Core Value

Give Claude everything it needs to do the work AND verify it - no manual context management, no quality degradation, no guessing.

## Current Milestone: v1.22 Orchestrator-Mediated Specialist Delegation

**Goal:** Fix specialist delegation by having orchestrator spawn specialists based on planner assignments.

**Target features:**
- Orchestrator generates available_agents.md dynamically for planner context
- Planner assigns specialists to tasks in PLAN.md (specialist field)
- Orchestrator reads PLAN.md and spawns appropriate specialists
- Remove broken executor delegation code (can't call Task())
- Specialists execute tasks, results flow back to orchestrator

**Architecture:**
```
Planner (assigns) → PLAN.md → Orchestrator (spawns) → Specialist (executes) → Results
```

## Previous Release

**v1.21 Hybrid Agent Team Execution** (shipped 2026-02-23)

What shipped:
- Domain detection with keyword-based pattern matching for 127+ VoltAgent specialists
- Task and result adapter layers for GSD-to-specialist context translation
- Co-authored commits with specialist attribution
- Structured delegation logging and observability
- Single-writer state pattern enforcement
- Comprehensive test suite (200+ tests) with mock specialists

**Known limitation (fixed in v1.22):**
- Executor delegation code assumed Task tool access, but subagents lack Task tool

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
- ✓ Domain detection and specialist registry — v1.21
- ✓ Task/result adapter layers — v1.21
- ✓ Co-authored commits — v1.21
- ✓ Delegation logging — v1.21
- ✓ Single-writer state pattern — v1.21

### Active

- Orchestrator-mediated specialist delegation (v1.22)
- Dynamic available_agents.md generation (v1.22)
- Planner specialist assignment in PLAN.md (v1.22)

### Out of Scope

- Real-time collaboration features — single-user focus
- GUI/web interface — CLI-first design
- Custom model training — uses existing Claude models

## Context

**VoltAgent plugins installed globally:**
- voltagent-core-dev, voltagent-lang, voltagent-infra, voltagent-qa-sec, voltagent-data-ai
- voltagent-dev-exp, voltagent-domains, voltagent-biz, voltagent-meta, voltagent-research

**Key architectural insight (v1.22):**
- Only orchestrators (main Claude) have Task tool access
- Subagents (gsd-executor, gsd-planner, etc.) do NOT have Task tool
- Delegation must be orchestrator-mediated, not subagent-initiated
- Available agents list must be passed to subagents via context files

## Constraints

- **Backward compatibility**: Existing workflows must continue working
- **GSD state management**: gsd-executor must remain the entry point to preserve STATE.md, PLAN.md, deviation rules, checkpoints, atomic commits
- **VoltAgent availability**: Specialists only available when plugins installed globally
- **Graceful fallback**: If specialist unavailable, execute directly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| gsd-executor as coordinator | Preserves GSD guarantees (state, commits, deviations) | ✓ Good |
| Adapter pattern (task + result) | Clean separation, reusable, testable | ✓ Good |
| Keyword matching for detection | Fast (<50ms), deterministic | ✓ Good |
| Single-writer state pattern | Prevents coordination failures | ✓ Good |
| Planner assigns specialists | Routing decision at planning time, not execution | — Pending |
| Orchestrator spawns specialists | Only orchestrator has Task tool access | — Pending |

---
*Last updated: 2026-02-23 after v1.22 milestone start*
