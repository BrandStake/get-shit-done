# Manual Verification Protocol - Phase 5

**Purpose:** Validate real VoltAgent specialist delegation with actual Claude instances

**Prerequisites:**
- GSD v1.21 installed with delegation support
- VoltAgent plugins installed: `npm install -g voltagent-lang voltagent-data-ai voltagent-infra`
- Test project directory: `.planning/test-delegation-project/` (create if needed)
- Verify specialists available: `ls ~/.claude/agents/python-pro.md ~/.claude/agents/typescript-pro.md ~/.claude/agents/kubernetes-specialist.md`

---

## Test Case 1: Python Specialist Delegation

**Objective:** Verify python-pro specialist executes Python task correctly and produces valid co-authored commit

**Setup:**
1. Enable delegation: Set `use_specialists: true` in `.planning/config.json`
2. Create test plan: `.planning/test-delegation-project/01-python-delegation-PLAN.md`
   - Task: Implement Python FastAPI authentication endpoint
   - Files: auth.py, models.py, routes.py, tests/test_auth.py
   - Verification: pytest passes
3. Verify python-pro available: `ls ~/.claude/agents/python-pro.md` (should exist)

**Execution:**
1. Run: `/gsd:execute-plan 1` from test project directory
2. Monitor execution for delegation log message: "Delegating task 1 to: python-pro"
3. Wait for task completion
4. Check git commit: `git log -1 --format=%B`
5. Check SUMMARY.md: `cat .planning/phases/01-*/01-01-SUMMARY.md`

**Verification:**
- [ ] Task delegated to python-pro (check console output: "Delegating task 1 to: python-pro")
- [ ] Files modified correctly (run: `git diff HEAD~1 --name-only`)
- [ ] Tests pass (run verification command: `pytest`)
- [ ] Commit includes co-authorship: `git log -1 | grep "Co-authored-by: python-pro"`
- [ ] Email domain correct: `git log -1 | grep "specialist@voltagent"`
- [ ] SUMMARY.md includes specialist metadata: `grep -A3 "specialist-usage:" *-SUMMARY.md`
- [ ] Deviations reported if any auto-fixes made (check SUMMARY.md deviations section)
- [ ] Delegation logged: `grep "python-pro" .planning/delegation.log`

**Expected Output:**
```
→ Analyzing task: Implement Python FastAPI authentication endpoint
→ Detected domain: python
→ Specialist available: python-pro
→ Delegating task 1 to: python-pro
  (Task tool invocation...)
✓ Specialist completed task
FILES MODIFIED: auth.py, models.py, routes.py, tests/test_auth.py
VERIFICATION: passed
✓ Committed with co-authorship attribution
```

**Pass Criteria:** All 8 verification checkboxes pass, commit has co-authorship trailer, SUMMARY.md contains specialist-usage frontmatter

---

## Test Case 2: Mixed-Domain Plan

**Objective:** Verify plan with multiple specialists routes correctly and tracks delegation per task

**Setup:**
1. Create plan with 5 tasks: `.planning/test-delegation-project/02-mixed-domain-PLAN.md`
   - Task 1: Python (FastAPI backend) - auth.py, models.py
   - Task 2: TypeScript (React frontend) - components/Auth.tsx
   - Task 3: Documentation (README updates) - README.md
   - Task 4: Kubernetes (deployment manifest) - k8s/deployment.yaml
   - Task 5: TypeScript (integration tests) - tests/integration.ts
2. Verify specialists available: `ls ~/.claude/agents/{python-pro,typescript-pro,kubernetes-specialist}.md`
3. Enable delegation: `use_specialists: true`

**Execution:**
1. Run: `/gsd:execute-plan 2`
2. Monitor routing decisions per task (console output shows delegation decisions)
3. After completion, check delegation log: `cat .planning/delegation.log | grep "02-02"`
4. Check SUMMARY.md specialist breakdown

**Verification:**
- [ ] Task 1 delegated to python-pro (log shows: "delegate,python-pro")
- [ ] Task 2 delegated to typescript-pro (log shows: "delegate,typescript-pro")
- [ ] Task 3 executed directly (log shows: "direct,complexity_threshold" - README doc task)
- [ ] Task 4 delegated to kubernetes-specialist (log shows: "delegate,kubernetes-specialist")
- [ ] Task 5 delegated to typescript-pro (log shows: "delegate,typescript-pro")
- [ ] SUMMARY.md shows delegation breakdown: `grep -c "specialist-usage" 02-*-SUMMARY.md` (4 tasks delegated)
- [ ] All commits have correct co-authorship for delegated tasks
- [ ] Task 3 commit has NO co-authorship (direct execution)

**Expected Delegation Log:**
```
2026-02-22T10:30:15Z,02-02,1,Python backend,python-pro,delegate,domain_match+complexity
2026-02-22T10:35:22Z,02-02,2,React frontend,typescript-pro,delegate,domain_match+complexity
2026-02-22T10:38:45Z,02-02,3,Update README,none,direct,complexity_threshold
2026-02-22T10:39:10Z,02-02,4,Kubernetes deploy,kubernetes-specialist,delegate,domain_match+complexity
2026-02-22T10:42:33Z,02-02,5,Integration tests,typescript-pro,delegate,domain_match+complexity
```

**Pass Criteria:** Routing decisions match expected specialists (4 delegated, 1 direct), delegation log shows all 5 tasks, SUMMARY.md metadata accurate

---

## Test Case 3: Fallback on Specialist Unavailable

**Objective:** Verify graceful fallback when specialist not installed

**Setup:**
1. Temporarily uninstall rust-engineer: `mv ~/.claude/agents/rust-engineer.md ~/.claude/agents/rust-engineer.md.bak` (if exists)
2. Verify rust-engineer unavailable: `ls ~/.claude/agents/rust-engineer.md` (should NOT exist)
3. Create plan with Rust task: `.planning/test-delegation-project/03-rust-fallback-PLAN.md`
   - Task: Implement Rust CLI parser
   - Files: src/main.rs, src/parser.rs
4. Enable delegation: `use_specialists: true`

**Execution:**
1. Run: `/gsd:execute-plan 3`
2. Monitor fallback behavior (console should show detection + fallback message)
3. Check delegation log: `grep "03-03" .planning/delegation.log`

**Verification:**
- [ ] Routing detects rust-engineer unavailable (console: "Specialist rust-engineer unavailable")
- [ ] Falls back to direct execution (console: "Falling back to direct execution")
- [ ] Task completes successfully (verification passes)
- [ ] No specialist metadata in SUMMARY.md for this task: `grep "specialist-usage" 03-*-SUMMARY.md` (should be empty)
- [ ] No errors or warnings in execution
- [ ] Delegation log shows: `direct,specialist_unavailable`
- [ ] Commit has NO co-authorship trailer

**Expected Output:**
```
→ Analyzing task: Implement Rust CLI parser
→ Detected domain: rust
→ Checking availability: rust-engineer
✗ Specialist rust-engineer unavailable
→ Falling back to direct execution
  (Direct execution proceeds...)
✓ Task completed
FILES MODIFIED: src/main.rs, src/parser.rs
VERIFICATION: passed
```

**Cleanup:**
```bash
# Restore rust-engineer if was backed up
mv ~/.claude/agents/rust-engineer.md.bak ~/.claude/agents/rust-engineer.md 2>/dev/null || true
```

**Pass Criteria:** Graceful degradation without errors, task completes, delegation log shows fallback reason, SUMMARY.md has no specialist metadata

---

## Test Case 4: Backward Compatibility (v1.20 Mode)

**Objective:** Verify v1.20 workflows work identically with use_specialists=false

**Setup:**
1. Disable delegation: Set `use_specialists: false` in `.planning/config.json`
2. Use existing v1.20 project structure (if available) OR create standard project
3. Create plan: `.planning/test-delegation-project/04-v120-compat-PLAN.md`
   - Standard task types (auto tasks, checkpoint:human-verify, etc.)
   - Mix of Python, TypeScript, documentation tasks
4. Verify specialists ARE installed: `ls ~/.claude/agents/{python-pro,typescript-pro}.md` (exist but should be ignored)

**Execution:**
1. Run: `/gsd:execute-plan 4`
2. Monitor for absence of delegation messages
3. Check delegation log: `grep "04-04" .planning/delegation.log`
4. Compare execution to v1.20 baseline (if available)

**Verification:**
- [ ] No delegation occurs (console shows NO "Delegating task" messages)
- [ ] All tasks execute directly (delegation log: all entries show "direct,specialists_disabled")
- [ ] STATE.md format unchanged (no specialist fields in frontmatter)
- [ ] SUMMARY.md format unchanged (no specialist-usage section): `grep "specialist-usage" 04-*-SUMMARY.md` (empty)
- [ ] Commits have standard format (no co-authorship): `git log --grep="Co-authored-by" 04-*` (no results)
- [ ] Execution time similar to v1.20 (no delegation overhead)
- [ ] All verification passes (standard GSD verification workflow)
- [ ] Config with voltagent section doesn't break execution

**Expected Console Output:**
```
GSD Executor - Phase 4 Plan 4
Configuration: use_specialists=false
→ Specialist delegation disabled
→ All tasks will be executed directly
  (Standard v1.20 execution proceeds...)
```

**Expected Delegation Log:**
```
2026-02-22T11:00:00Z,04-04,1,Python task,none,direct,specialists_disabled
2026-02-22T11:05:00Z,04-04,2,TypeScript task,none,direct,specialists_disabled
2026-02-22T11:10:00Z,04-04,3,Docs task,none,direct,specialists_disabled
```

**Pass Criteria:** Identical behavior to v1.20 (no delegation-related changes), all tasks direct execution, no specialist metadata anywhere

---

## Test Case 5: Zero Specialists Installed

**Objective:** Verify system works with no VoltAgent plugins installed

**Setup:**
1. Backup existing specialists: `mkdir -p ~/.claude/agents-backup && cp ~/.claude/agents/*.md ~/.claude/agents-backup/ 2>/dev/null || true`
2. Remove all VoltAgent specialists: `rm -f ~/.claude/agents/{python-pro,typescript-pro,kubernetes-specialist,rust-engineer}.md` (keep only gsd-* agents)
3. Verify empty registry: `ls ~/.claude/agents/*.md | grep -v gsd- | wc -l` (should be 0)
4. Enable delegation: `use_specialists: true` (to test detection)
5. Create plan: `.planning/test-delegation-project/05-zero-specialists-PLAN.md`
   - Mix of task types (Python, TypeScript, docs)

**Execution:**
1. Run: `/gsd:execute-plan 5`
2. Monitor detection and fallback behavior
3. Check delegation log for all entries showing direct execution

**Verification:**
- [ ] System detects zero specialists available (console: "No VoltAgent specialists detected")
- [ ] Logs message: "Using direct execution for all tasks"
- [ ] All tasks execute directly without errors
- [ ] No crashes or exceptions during specialist detection phase
- [ ] SUMMARY.md has no specialist metadata: `grep "specialist-usage" 05-*-SUMMARY.md` (empty)
- [ ] Execution completes successfully with all verification passing
- [ ] Delegation log shows all tasks as direct: `grep "05-05" .planning/delegation.log | grep -c "direct"` (equals task count)

**Expected Output:**
```
GSD Executor - Phase 5 Plan 5
Configuration: use_specialists=true
→ Scanning for VoltAgent specialists...
→ Available specialists: (none)
⚠ No VoltAgent specialists detected
→ Using direct execution for all tasks
  (Direct execution proceeds normally...)
✓ All tasks completed
```

**Expected Delegation Log:**
```
2026-02-22T11:30:00Z,05-05,1,Python task,none,direct,specialist_unavailable
2026-02-22T11:35:00Z,05-05,2,TypeScript task,none,direct,specialist_unavailable
2026-02-22T11:40:00Z,05-05,3,Docs task,none,direct,complexity_threshold
```

**Cleanup:**
```bash
# Restore specialists
cp ~/.claude/agents-backup/*.md ~/.claude/agents/ 2>/dev/null || true
rm -rf ~/.claude/agents-backup
```

**Pass Criteria:** System operates normally without specialists, degrades gracefully to v1.20 behavior, no errors, all tasks complete

---

## Pass/Fail Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1. Python Specialist Delegation | ☐ Pass ☐ Fail | |
| 2. Mixed-Domain Plan | ☐ Pass ☐ Fail | |
| 3. Fallback on Unavailable | ☐ Pass ☐ Fail | |
| 4. Backward Compatibility | ☐ Pass ☐ Fail | |
| 5. Zero Specialists | ☐ Pass ☐ Fail | |

**Overall Result:** ☐ All Pass ☐ Some Failed

**Date Tested:** _____________
**Tester:** _____________
**GSD Version:** v1.21
**Notes:**
