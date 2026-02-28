# Fix Phase Autonomous Flow - Design Plan

## Problem Statement

When `verify-work` finds issues during Phase 1 (Structural) or Phase 2 (Functional) verification, it creates fix phases (e.g., `01.1-fix-xxx`). These fix phases must flow autonomously through the it-just-works loop without human intervention.

**Current gaps:**
1. Fix phases are created with only `GAPS.md` - no `CONTEXT.md`
2. Main loop detects them as `not_started` → routes to `discuss-phase`
3. `discuss-phase` analyzes ROADMAP goal `[Urgent work - to be planned]` - useless
4. `plan-phase` doesn't receive `--gaps` flag → doesn't read verification context
5. No re-verification of parent phase after fix phases complete

---

## Scenarios to Handle

### Scenario A: Stage 1 (Structural) Finds Issues
```
Phase 1 → execute → verify (Stage 1 fails)
  → Creates 1.1-fix-missing-fetch, 1.2-fix-auth-header
  → Phase 1 status: gaps_found
  → Loop must execute 1.1, 1.2, then continue
```

### Scenario B: Stage 2 (Functional/UAT) Finds Issues
```
Phase 1 → execute → verify (Stage 1 passes, Stage 2 fails)
  → Creates 1.1-fix-broken-submit
  → Phase 1 status: issues_found
  → Loop must execute 1.1, then continue
```

### Scenario C: Fix Phase Verification Finds Issues
```
Phase 1.1 → execute → verify (fails)
  → Creates 1.1.1? or 1.2?
  → Must handle nested fixes
```

### Scenario D: Multiple Phases Have Issues
```
Phase 1: gaps_found → creates 1.1, 1.2
Phase 2: issues_found → creates 2.1
Sorted order: 1, 1.1, 1.2, 2, 2.1, 3...
```

### Scenario E: Parent Phase Re-verification
```
After 1.1 and 1.2 verified:
  → Does Phase 1 get re-verified?
  → Or rely on milestone audit?
```

---

## Design Decisions

### Decision 1: Fix phases get CONTEXT.md at creation time

**When verify-work creates a fix phase, also create CONTEXT.md from GAPS.md.**

This achieves:
- Fix phase appears as `discussed` status (has CONTEXT.md)
- Main loop skips `discuss-phase` automatically
- No special status detection needed
- Single code path through plan → execute → verify

**CONTEXT.md structure for fix phases:**
```markdown
---
phase: 01.1-fix-dashboard-fetch
gathered: 2024-01-15T10:30:00Z
status: Ready for planning
source_phase: 01
source_verification: .planning/phases/01-dashboard/01-VERIFICATION.md
skip_research: true
---

# Phase 01.1: Fix Dashboard Data Fetch - Context

**Source:** Verification gaps from Phase 01
**Mode:** Fix phase (auto-generated)

## Phase Boundary

Close gaps identified in Phase 01 verification.

## Gaps to Close

### Gap 1: Dashboard doesn't fetch from API (Stage 1 - critical)

**Root Cause:** useEffect missing fetch call
**Severity:** critical

**Artifacts:**
- `src/components/Dashboard.tsx` - needs fetch implementation

**Missing:**
- useEffect with fetch to /api/user/data
- State for user data
- Render user data in JSX

### Gap 2: Auth header not included (Stage 1 - major)

**Root Cause:** fetch call missing Authorization header
**Severity:** major

**Missing:**
- Include auth token in fetch headers

## Implementation Notes

- This is a targeted fix, not exploratory work
- Research skipped - gaps are well-defined
- Verify against original phase requirements after completion
```

### Decision 2: plan-phase respects `skip_research` frontmatter

**Modify plan-phase to check CONTEXT.md frontmatter:**

```bash
# In plan-phase step 5 (Handle Research)
SKIP_RESEARCH=$(grep "^skip_research:" "$CONTEXT_PATH" | grep -c "true")
if [ "$SKIP_RESEARCH" -gt 0 ]; then
  # Skip research, use CONTEXT.md directly
fi
```

This is cleaner than passing `--gaps` flag - the context file itself declares intent.

### Decision 3: Main loop status detection handles `has_issues`

**Current behavior (broken):**
```
has_issues → "fix phases should already exist, find and execute them"
```

**Fixed behavior:**
```bash
# When phase has VERIFICATION.md with non-passed status
if [ "$PHASE_STATUS" = "has_issues" ]; then
  # Skip this phase - fix phases should exist as X.1, X.2, etc.
  # Continue loop to find next unverified phase
  continue
fi
```

The loop naturally finds fix phases next since they sort after parent:
- Phase 1: has_issues → skip
- Phase 1.1: not_started (but has CONTEXT.md) → discussed → plan
- Phase 1.2: not_started (but has CONTEXT.md) → discussed → plan
- Phase 2: not_started → discuss

### Decision 4: No automatic re-verification of parent phase

**Rationale:**
- Fix phases are scoped fixes, not full phase re-implementation
- Parent phase VERIFICATION.md already documents what was wrong
- Milestone audit catches any remaining gaps
- Re-verification adds complexity and potential infinite loops

**Alternative considered:** After all X.* verified, re-run verify-work on X
- Rejected: Complex detection logic, risk of loops, milestone audit is sufficient

### Decision 5: Nested fix phases use decimal notation

**If fix phase 1.1 verification fails:**
- Create 1.2 (sibling), not 1.1.1 (child)
- Keeps sorting simple: 1 < 1.1 < 1.2 < 1.3 < 2
- `phase insert 1.1 "Fix: ..."` → creates 1.2

**phase.cjs already handles this:**
```javascript
// cmdPhaseNextDecimal finds highest existing decimal and increments
const nextDecimal = existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
```

### Decision 6: Milestone audit validates all gaps closed

**Current flow:**
```
All phases verified → milestone_audit → complete_milestone
```

**Milestone audit checks:**
- All requirements satisfied
- All phases verified (including fix phases)
- If parent has `has_issues` but all fix phases `verified` → audit checks requirements

**If audit finds remaining gaps:**
- `plan-milestone-gaps` creates additional phases
- Loop continues until audit passes

---

## Implementation Plan

### Change 1: verify-work.md - Create CONTEXT.md for fix phases

**Location:** `diagnose_and_fix` step (after step 4.5)

**Add step 4.5b: Create CONTEXT.md from GAPS.md**

```markdown
**4.5b. Create CONTEXT.md for fix phase:**

For each fix phase created, generate CONTEXT.md:

```bash
CONTEXT_PATH="${directory}/${new_phase_number}-CONTEXT.md"
cat > "$CONTEXT_PATH" << EOF
---
phase: ${new_phase_number}-${slug}
gathered: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
status: Ready for planning
source_phase: ${phase_number}
source_verification: ${PHASE_DIR}/${phase_num}-VERIFICATION.md
skip_research: true
---

# Phase ${new_phase_number}: ${FIX_NAME} - Context

**Source:** Verification gaps from Phase ${phase_number}
**Mode:** Fix phase (auto-generated)

## Phase Boundary

Close gaps identified in Phase ${phase_number} verification.

## Gaps to Close

$(cat "${directory}/GAPS.md" | tail -n +8)

## Implementation Notes

- This is a targeted fix, not exploratory work
- Research skipped - gaps are well-defined
- Verify against original phase requirements after completion
EOF
```

Include CONTEXT.md in the commit:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "fix(${phase_num}): create fix phases from verification gaps" \
  --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/*
```
```

### Change 2: plan-phase.md - Respect skip_research frontmatter

**Location:** Step 5 (Handle Research)

**Modify skip conditions:**

```markdown
## 5. Handle Research

**Skip if:**
- `--gaps` flag present
- `--skip-research` flag present
- `research_enabled` is false (from init) without `--research` override
- **NEW: CONTEXT.md frontmatter contains `skip_research: true`**

```bash
# Check CONTEXT.md for skip_research flag
if [ -n "$CONTEXT_PATH" ] && [ -f "$CONTEXT_PATH" ]; then
  SKIP_RESEARCH_FLAG=$(grep "^skip_research:" "$CONTEXT_PATH" 2>/dev/null | grep -c "true" || echo "0")
  if [ "$SKIP_RESEARCH_FLAG" -gt 0 ]; then
    echo "Skipping research: fix phase with pre-defined context"
    # Continue to step 6
  fi
fi
```
```

### Change 3: it-just-works.md - Handle has_issues status

**Location:** main_loop Step 2 (Status → Action mapping)

**Clarify has_issues handling:**

```markdown
**Status → Action mapping:**
- `not_started` → run `/gsd:discuss-phase`
- `discussed` → run `/gsd:plan-phase`
- `planned` → run `/gsd:execute-phase`
- `executed` → run `/gsd:verify-work --auto`
- `has_issues` → **SKIP this phase** (fix phases X.1, X.2 should exist and will be processed next in sort order)
- `verified` → skip to next phase

**IMPORTANT:** When a phase has `has_issues` status, do NOT attempt to re-verify or re-execute it. The fix phases created by verify-work will close the gaps. Continue the loop to find the next unverified phase (which will be the fix phases due to sort order).
```

### Change 4: Add status detection for "discussed" (has CONTEXT.md)

**Location:** main_loop Step 2 (Status detection)

**Current logic misses CONTEXT.md check:**

```bash
# Current (broken for fix phases)
if [ "$HAS_CONTEXT" -gt 0 ]; then
  PHASE_STATUS="discussed"
```

Wait, this IS in the current code. Let me re-read...

Actually looking at the current code:
```bash
elif [ "$HAS_CONTEXT" -gt 0 ]; then
  PHASE_STATUS="discussed"  # Needs planning
else
  PHASE_STATUS="not_started"  # Needs discussion
fi
```

So if CONTEXT.md exists, status is "discussed" → routes to plan-phase. This is correct!

The issue is verify-work doesn't CREATE CONTEXT.md. Once we fix that (Change 1), this works.

---

## Verification Checklist

After implementation, verify these scenarios work autonomously:

### Test 1: Stage 1 gaps create working fix phases
```
1. Execute phase with missing artifact
2. verify-work finds structural gap
3. Fix phase created with CONTEXT.md
4. Main loop detects fix phase as "discussed"
5. plan-phase runs without research
6. execute-phase runs
7. verify-work passes
8. Continue to next phase
```

### Test 2: Stage 2 gaps create working fix phases
```
1. Execute phase with broken UAT test
2. verify-work finds functional gap
3. Fix phase created with CONTEXT.md
4. Same flow as Test 1
```

### Test 3: Fix phase with issues creates sibling fix
```
1. Fix phase 1.1 executed
2. verify-work finds issues in 1.1
3. Creates 1.2 (not 1.1.1)
4. 1.2 has CONTEXT.md
5. Loop processes 1.2
```

### Test 4: Parent phase skipped correctly
```
1. Phase 1 has has_issues status
2. Fix phases 1.1, 1.2 exist
3. Main loop skips Phase 1
4. Processes 1.1, then 1.2
5. Continues to Phase 2
```

### Test 5: Milestone audit catches remaining gaps
```
1. All phases including fix phases verified
2. Milestone audit runs
3. If original requirement still unsatisfied → new phase created
4. Loop continues
```

---

## Files to Modify

| File | Change |
|------|--------|
| `get-shit-done/workflows/verify-work.md` | Add step 4.5b: Create CONTEXT.md from GAPS.md |
| `get-shit-done/workflows/plan-phase.md` | Step 5: Check `skip_research` frontmatter |
| `get-shit-done/workflows/it-just-works.md` | Clarify `has_issues` handling in Step 2 |

---

## Rollout

1. **Phase 1:** Implement Change 1 (verify-work creates CONTEXT.md)
   - This alone fixes the autonomous flow
   - Fix phases appear as "discussed" status
   - plan-phase runs normally (research happens but is harmless)

2. **Phase 2:** Implement Change 2 (skip_research frontmatter)
   - Optimization: avoids unnecessary research agent spawn
   - Fix phases execute faster

3. **Phase 3:** Implement Change 3 (clarify has_issues docs)
   - Documentation clarity
   - No code change needed - existing loop behavior is correct

---

## Summary

The core fix is **Change 1**: verify-work must create CONTEXT.md when creating fix phases. This single change makes the autonomous loop work because:

1. Fix phase has CONTEXT.md → status = "discussed"
2. Main loop skips discuss-phase → routes to plan-phase
3. plan-phase reads CONTEXT.md with gap details
4. Normal execution continues

The other changes are optimizations and documentation improvements.
