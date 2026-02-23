# GSD Milestones

## Shipped

### v1.20.5 (2026-02-19)

Final release before v1.21 planning infrastructure added.

**Key capabilities delivered:**
- Multi-agent orchestration with thin orchestrators
- Phase-based development workflow with atomic commits
- Context engineering (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md)
- Wave-based parallel execution with dependency graphs
- Goal-backward verification with gsd-verifier
- Research phase with 4 parallel researchers
- Quick mode for ad-hoc tasks
- Model profiles (quality/balanced/budget)
- gsd-tools CLI for deterministic operations
- Cross-platform: Claude Code, OpenCode, Gemini CLI

**Last phase:** N/A (pre-GSD planning infrastructure)

---

## v1.21 Hybrid Agent Team Execution (Shipped: 2026-02-23)

**Phases completed:** 6 phases, 12 plans, 27 requirements

**Key accomplishments:**
- Domain detection with keyword-based pattern matching for 127+ VoltAgent specialists
- Task and result adapter layers for GSD-to-specialist context translation
- Co-authored commits with specialist attribution
- Structured delegation logging and observability
- Single-writer state pattern enforcement
- Comprehensive test suite (200+ tests) with mock specialists

**Known tech debt:**
- Specialist delegation architecture assumes gsd-executor has Task tool access, but subagents don't have Task tool (discovered post-milestone)
- This limitation will be addressed in v1.22 with orchestrator-mediated delegation

**Archived:** `.planning/milestones/v1.21-ROADMAP.md`, `.planning/milestones/v1.21-REQUIREMENTS.md`

---

