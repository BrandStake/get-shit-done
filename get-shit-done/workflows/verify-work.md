<purpose>
Unified verification workflow for GSD phases. Runs two-stage verification:
- Stage 1: Structural - Must-haves checking, artifact verification, key links, anti-patterns
- Stage 2: Functional - UAT testing (manual or automated)

Creates a single VERIFICATION.md with both stages' results.
</purpose>

<philosophy>
**Two stages, one output.**

Stage 1 (Structural) verifies the code exists and is wired correctly.
Stage 2 (Functional) verifies the code works as expected.

Both stages run. Both results go into VERIFICATION.md.
If Stage 1 finds critical gaps, Stage 2 can be skipped.
Fix phases are only created ONCE, after both stages complete.
</philosophy>

<template>
@~/.claude/get-shit-done/templates/VERIFICATION.md (unified two-stage verification)
</template>

<process>

<step name="initialize" priority="first">
Parse arguments and load context:

```bash
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs init verify-work "${PHASE_ARG}")
```

Parse JSON for: `planner_model`, `checker_model`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `has_verification`.

**Parse flags:**

```bash
AUTO_MODE=false
SKIP_STAGE1=false
SKIP_STAGE2=false

if [[ "$ARGUMENTS" == *"--auto"* ]]; then
  AUTO_MODE=true
fi
if [[ "$ARGUMENTS" == *"--skip-structural"* ]]; then
  SKIP_STAGE1=true
fi
if [[ "$ARGUMENTS" == *"--skip-functional"* ]]; then
  SKIP_STAGE2=true
fi
```

**Check for existing verification:**

```bash
EXISTING_VERIFICATION="$PHASE_DIR/${PHASE_NUM}-VERIFICATION.md"
if [ -f "$EXISTING_VERIFICATION" ]; then
  # Read status from frontmatter
  PREV_STATUS=$(grep "^status:" "$EXISTING_VERIFICATION" | cut -d: -f2 | tr -d ' ')
  if [ "$PREV_STATUS" = "passed" ]; then
    echo "Phase already verified and passed. Use --force to re-verify."
    # Exit unless --force flag
    if [[ "$ARGUMENTS" != *"--force"* ]]; then
      exit 0
    fi
  fi
fi
```
</step>

<step name="stage1_structural">
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**STAGE 1: STRUCTURAL VERIFICATION**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

Verify the code exists and is properly wired. This checks:
- Must-haves from PLAN.md frontmatter
- Artifact existence (Level 1)
- Artifact substance (Level 2 - not a stub)
- Artifact wiring (Level 3 - connected/imported)
- Key link verification
- Anti-pattern scanning

**If SKIP_STAGE1=true:** Skip to `stage2_functional`

**1.1. Load phase context:**

```bash
ls "$PHASE_DIR"/*-PLAN.md 2>/dev/null
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
PHASE_GOAL=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs roadmap get-phase "$PHASE_NUM" --field goal)
```

**1.2. Extract must-haves from PLAN frontmatter:**

Check for `must_haves:` block in each PLAN.md:

```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
  key_links:
    - from: "Chat.tsx"
      to: "api/chat"
      via: "fetch in useEffect"
```

**If no must_haves in frontmatter:** Derive from phase goal:
1. State the goal from ROADMAP.md
2. Derive truths: "What must be TRUE?" — list 3-7 observable behaviors
3. Derive artifacts: For each truth, "What must EXIST?"
4. Derive key links: For each artifact, "What must be CONNECTED?"

**1.3. Verify artifacts (Three Levels):**

For each artifact:

```bash
ARTIFACT_RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify artifacts "$PLAN_PATH")
```

Parse JSON: `{ all_passed, passed, total, artifacts: [{path, exists, issues, passed}] }`

| exists | issues empty | Status |
|--------|--------------|--------|
| true   | true         | ✓ VERIFIED |
| true   | false        | ✗ STUB |
| false  | -            | ✗ MISSING |

**For wiring (Level 3):**

```bash
# Import check
grep -r "import.*$artifact_name" "${search_path:-src/}" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l

# Usage check
grep -r "$artifact_name" "${search_path:-src/}" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "import" | wc -l
```

| Exists | Substantive | Wired | Status |
|--------|-------------|-------|--------|
| ✓      | ✓           | ✓     | ✓ VERIFIED |
| ✓      | ✓           | ✗     | ⚠️ ORPHANED |
| ✓      | ✗           | -     | ✗ STUB |
| ✗      | -           | -     | ✗ MISSING |

**1.4. Verify key links:**

```bash
LINKS_RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify key-links "$PLAN_PATH")
```

Parse JSON: `{ all_verified, verified, total, links: [{from, to, via, verified, detail}] }`

**1.5. Scan for anti-patterns:**

```bash
# TODO/FIXME/placeholder comments
grep -n -E "TODO|FIXME|XXX|HACK|PLACEHOLDER" "$file" 2>/dev/null
# Empty implementations
grep -n -E "return null|return \{\}|return \[\]|=> \{\}" "$file" 2>/dev/null
```

Categorize: 🛑 Blocker | ⚠️ Warning | ℹ️ Info

**1.6. Spawn verification specialists (if configured):**

Check for `verification:` block in plan frontmatter:

```yaml
verification:
  tier: 2
  specialists:
    - voltagent-qa-sec:code-reviewer
    - voltagent-qa-sec:qa-expert
```

If specialists defined, spawn in parallel:

```
Task(
  subagent_type="{specialist}",
  model="sonnet",
  prompt="""
<review_context>
**Phase:** {phase_number}
**What was built:** {Summary from SUMMARY.md}

**Files to review:**
{files_modified}
</review_context>

<your_role>
Review code for quality, security, test coverage based on specialist type.
</your_role>

<output_format>
Return structured findings:
## {Specialist Type} Review
### Issues Found
- **Severity:** critical | major | minor
- **File:** path
- **Issue:** description
- **Recommendation:** how to fix
### Summary
Total issues: N (critical: N, major: N, minor: N)
</output_format>
""",
  description="{specialist} review"
)
```

**1.7. Determine Stage 1 status:**

```
STAGE1_STATUS=passed
STAGE1_SCORE="N/M"
STAGE1_CRITICAL_GAPS=[]

# Failed truths/artifacts
if any_truth_failed or any_artifact_missing_or_stub:
  STAGE1_STATUS=gaps_found

# Critical specialist findings
if critical_issues > 0 or major_issues >= 3:
  STAGE1_STATUS=gaps_found
```

**1.8. Early exit check:**

If Stage 1 finds critical structural gaps AND AUTO_MODE=true:
```
Skip Stage 2 (functional testing won't help if code doesn't exist/work)
Proceed to complete_verification
```

If Stage 1 finds gaps but not critical:
```
Continue to Stage 2 (functional testing may reveal more issues)
```
</step>

<step name="stage2_functional">
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**STAGE 2: FUNCTIONAL VERIFICATION (UAT)**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

Verify the code works as expected through user acceptance testing.

**If SKIP_STAGE2=true:** Skip to `complete_verification`

**2.1. Extract testable deliverables from SUMMARY.md:**

```bash
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
```

Parse for:
1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions

Create test for each deliverable:
- name: Brief test name
- expected: What the user should see/experience

**2.2. Build test list:**

```yaml
tests:
  - number: 1
    name: "Send a message"
    expected: "User types message, clicks send, message appears in list"
  - number: 2
    name: "View message history"
    expected: "On page load, existing messages display in chronological order"
```

**2.3. Execute tests based on mode:**

**If AUTO_MODE=true:** Run automated testing

Check agent teams config:
```bash
AGENT_TEAMS_ENABLED=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get agent_teams.enabled --raw 2>/dev/null || echo "false")
```

If enabled, create verification team and spawn test agents:

```
TeamCreate(team_name="verify-{phase_number}", description="UAT for phase {phase_number}")

# Create tasks for each test
TaskCreate(subject="Test: {test_name}", description="Expected: {expected}...")

# Spawn test agents
Task(
  team_name="verify-{phase_number}",
  name="tester-{N}",
  subagent_type="voltagent-qa-sec:qa-expert",
  model="sonnet",
  prompt="You are a test agent. Check TaskList, claim tests, verify expected behavior, mark PASS/FAIL/SKIP."
)
```

Monitor until all tasks complete, collect results, cleanup team.

**If AUTO_MODE=false:** Run manual testing

Present tests one at a time:
```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

Process responses:
- "pass", "yes", "y", "ok" → mark passed
- "skip", "n/a" → mark skipped
- Anything else → mark as issue, infer severity

**2.4. Determine Stage 2 status:**

```
STAGE2_STATUS=passed
STAGE2_SCORE="N/M tests passed"
STAGE2_ISSUES=[]

if any_test_failed:
  STAGE2_STATUS=issues_found
```
</step>

<step name="complete_verification">
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**COMPLETE: CREATE VERIFICATION.md**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

**3.1. Determine overall status:**

```
if STAGE1_STATUS=gaps_found:
  OVERALL_STATUS=gaps_found
elif STAGE2_STATUS=issues_found:
  OVERALL_STATUS=issues_found
else:
  OVERALL_STATUS=passed
```

**3.2. Create VERIFICATION.md:**

Use Write tool to create `.planning/phases/{phase_dir}/{phase_num}-VERIFICATION.md`:

```markdown
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed | gaps_found | issues_found
mode: auto | manual

stage1:
  status: passed | gaps_found | skipped
  score: N/M must-haves verified
  truths_verified: N
  truths_total: M
  artifacts_verified: N
  key_links_verified: N
  anti_patterns: N
  specialist_review:
    tier: 2
    total_issues: N
    critical: N
    major: N
    minor: N

stage2:
  status: passed | issues_found | skipped
  score: N/M tests passed
  tests_passed: N
  tests_failed: N
  tests_skipped: N

gaps: # Only if status != passed
  - truth: "Observable truth that failed"
    stage: 1 | 2
    status: failed
    reason: "Why it failed"
    severity: critical | major | minor
    artifacts:
      - path: "src/path/to/file.tsx"
        issue: "What's wrong"
    missing:
      - "Specific thing to add/fix"
---

# Phase {X}: {Name} Verification Report

**Phase Goal:** {goal from ROADMAP.md}
**Verified:** {timestamp}
**Status:** {status}
**Mode:** {auto | manual}

## Stage 1: Structural Verification

{If skipped: "Skipped via --skip-structural flag"}

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth} | ✓ VERIFIED | {evidence} |
| 2 | {truth} | ✗ FAILED | {what's wrong} |

**Score:** {N}/{M} truths verified

### Required Artifacts

| Artifact | Status | Level 1 | Level 2 | Level 3 |
|----------|--------|---------|---------|---------|
| `path` | ✓ | exists | substantive | wired |

### Key Links

| From | To | Via | Status |
|------|-----|-----|--------|

### Anti-Patterns

| File | Line | Pattern | Severity |
|------|------|---------|----------|

### Specialist Reviews

{Only if verification.specialists was in plan}

| Specialist | Issues | Critical | Major | Minor |
|------------|--------|----------|-------|-------|

---

## Stage 2: Functional Verification (UAT)

{If skipped: "Skipped via --skip-functional flag or Stage 1 critical gaps"}

### Test Results

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1 | {name} | {expected} | PASS | |
| 2 | {name} | {expected} | FAIL | {user response} |

**Score:** {N}/{M} tests passed

---

## Summary

| Stage | Status | Score |
|-------|--------|-------|
| Stage 1: Structural | {status} | {N/M} |
| Stage 2: Functional | {status} | {N/M} |
| **Overall** | **{status}** | |

{If gaps/issues found:}
### Gaps Found

{N} gaps blocking completion:

1. **{Truth/Test}** (Stage {N}) — {reason}
   - Severity: {severity}
   - Missing: {what needs to be added}

---

_Verified: {timestamp}_
_Verifier: Claude (verify-work)_
```

**3.3. Commit VERIFICATION.md:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "verify({phase_num}): complete verification - {status}" --files ".planning/phases/{phase_dir}/{phase_num}-VERIFICATION.md"
```

**3.4. Route based on status:**

**If status=passed:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ VERIFICATION PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {X}: {Name} verified successfully.

Stage 1 (Structural): {N}/{M} must-haves verified
Stage 2 (Functional): {N}/{M} tests passed

Next Steps:
- /gsd:plan-phase {next} — Plan next phase
- /gsd:execute-phase {next} — Execute next phase
```

**If status=gaps_found or issues_found:**
Proceed to `diagnose_and_fix`
</step>

<step name="diagnose_and_fix">
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**DIAGNOSE ISSUES AND CREATE FIX PHASES**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

**4.1. Check auto-insert config:**

```bash
AUTO_INSERT_PHASES=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.auto_insert_fix_phases --raw 2>/dev/null || echo "false")
```

**If AUTO_INSERT_PHASES=false:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✗ VERIFICATION FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} gaps found. See VERIFICATION.md for details.

Run `/gsd:plan-phase {phase} --gaps` to plan fixes.
```
Exit workflow.

**If AUTO_INSERT_PHASES=true:**

**4.2. Spawn debug agents for diagnosis (optional):**

If issues are complex, spawn parallel debug agents to investigate root causes.
Update VERIFICATION.md gaps with root_cause field.

**4.3. Group gaps into fix phases:**

Rules:
- Same affected file/component → combine
- Same subsystem (auth, API, UI) → combine
- Keep phases focused: 1-3 gaps each

**4.4. Create fix phases:**

For each grouped fix:

```bash
FIX_NAME="Fix: {primary issue summary}"
RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs phase insert "${phase_number}" "${FIX_NAME}")
```

Extract: `new_phase_number`, `directory`, `slug`

**4.5. Create GAPS.md for each fix phase:**

```bash
cat > "${directory}/GAPS.md" << 'EOF'
---
source_phase: {phase_number}
source_verification: {phase_dir}/{phase_num}-VERIFICATION.md
created: {timestamp}
---

## Gaps to Close

### Gap {N}: {truth}

**Stage:** {1 or 2}
**Severity:** {severity}
**Root Cause:** {root_cause}
**Reported:** {reason}

**Artifacts:**
{list artifacts}

**Missing:**
{list missing items}
EOF
```

**4.6. Update STATE.md:**

Add entry under "Roadmap Evolution":
```
- Phases {X.1}, {X.2}... inserted after Phase {X}: Fix phases from verification (AUTO)
```

**4.7. Commit changes:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "fix({phase_num}): create fix phases from verification gaps" --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/*
```

**4.8. Present completion:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FIX PHASES CREATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Source:** Phase {phase_number} Verification
**Gaps found:** {N}
**Fix phases created:** {M}

| Phase | Name | Gaps |
|-------|------|------|
| {X.1} | {name} | {gap list} |

Next: `/gsd:plan-phase {X.1}`
```
</step>

</process>

<severity_inference>
**Infer severity from context:**

| Signal | Severity |
|--------|----------|
| Artifact MISSING, crashes, exception | critical |
| Artifact STUB, doesn't work, wrong behavior | major |
| ORPHANED, works but..., slow, minor issue | minor |
| Color, spacing, alignment | cosmetic |

Default to **major** if unclear.
</severity_inference>

<success_criteria>
- [ ] Stage 1 (Structural) runs: must-haves, artifacts, key links, anti-patterns
- [ ] Verification specialists spawned if configured in plan
- [ ] Stage 2 (Functional) runs: UAT tests (auto or manual)
- [ ] Single VERIFICATION.md created with both stages
- [ ] Overall status determined from both stages
- [ ] If gaps found: fix phases created (if auto_insert enabled)
- [ ] Committed on completion
- [ ] Ready for next phase or fix phase execution
</success_criteria>
