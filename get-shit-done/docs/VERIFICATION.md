# VoltAgent Verification Teams

## Overview
Verification teams provide quality gates through multi-specialist review after task completion.

## Verification Tiers

### Tier 1 - Light Verification
- **Specialists:** code-reviewer only
- **Use for:** Simple changes, configs, documentation
- **Focus:** Code quality, obvious issues, patterns

### Tier 2 - Standard Verification
- **Specialists:** code-reviewer + qa-expert
- **Use for:** Feature implementation, business logic
- **Focus:** + Test coverage, edge cases, error handling

### Tier 3 - Deep Verification
- **Specialists:** code-reviewer + qa-expert + principal-engineer
- **Use for:** Security, payments, authentication, database changes
- **Focus:** + Architecture, scalability, production readiness
- **Execution:** Sequential chain - each specialist builds on prior findings

## Tier Classification

Tasks are automatically classified based on keywords and patterns:
- Security, auth, payment, crypto → Tier 3
- API, business-logic, integration → Tier 2
- Config, docs, UI styling → Tier 1

Override in PLAN.md task frontmatter:
```yaml
verification_tier: 3
```

## Configuration

Configure in `.planning/config.json`:
```json
{
  "verification": {
    "enabled": true,
    "default_tier": 1,
    "tier_overrides": {
      "authentication": 3,
      "payments": 3
    }
  }
}
```

The `tier_overrides` field allows you to force specific verification tiers for tasks containing certain keywords, providing override capability for orchestrator verification decisions (VT-08).

Disable for specific execution:
```bash
SKIP_VERIFICATION=true /gsd:execute-phase 07.1
```

## Specialist Responsibilities

### code-reviewer
- Static analysis for vulnerabilities
- Code pattern compliance
- Performance implications
- Technical debt identification

### qa-expert
- Test coverage analysis
- Edge case identification
- Quality metrics assessment
- Regression risk evaluation

### principal-engineer
- Architecture alignment
- Scalability verification
- Production readiness
- Error recovery patterns

## Verification Flow

1. Task completes execution
2. Orchestrator determines verification tier
3. Spawns appropriate specialists (parallel or sequential)
4. Each specialist reviews with their domain focus
5. Results aggregated into decision
6. PASS → task marked complete
7. FAIL → issues reported, user decides next step

## Graceful Degradation

When specialists unavailable:
- Required specialists missing → Skip verification with warning
- Optional specialists missing → Continue with available
- No specialists available → Log warning, mark task complete

## Result Aggregation

Multiple specialist findings are combined:
- FAIL from any specialist → Overall FAIL
- All PASS with some WARNING → Overall WARNING
- All PASS → Overall PASS

Priority: Security > Functionality > Performance > Style

## Override Capabilities

The verification system supports multiple override mechanisms:

1. **Task-level override:** Set `verification_tier` in PLAN.md task frontmatter
2. **Domain-based override:** Configure `tier_overrides` in config.json for keyword-based tier assignment
3. **Execution-level override:** Set `SKIP_VERIFICATION=true` environment variable
4. **Global toggle:** Set `verification.enabled: false` in config.json

These overrides fulfill requirement VT-08 for orchestrator verification decision control.

## Examples

### Tier 3 Sequential Chain
```
Task: Implement JWT authentication
1. code-reviewer → Finds SQL injection risk → FAIL
2. Task sent back for fixes
3. After fix, verification restarts
4. code-reviewer → PASS
5. qa-expert → Missing rate limit tests → WARNING
6. principal-engineer → Needs refresh token rotation → FAIL
7. Overall: FAIL (must fix principal's findings)
```

### Tier 2 Parallel Verification
```
Task: Add user profile API
1. code-reviewer + qa-expert spawn in parallel
2. code-reviewer → PASS with style suggestions
3. qa-expert → WARNING: Consider edge case tests
4. Overall: WARNING (logged but task proceeds)
```

### Configuration Examples

#### Enable All Verification
```json
{
  "verification": {
    "enabled": true,
    "default_tier": 2,
    "required_specialists": ["code-reviewer"],
    "fail_on_missing_required": false
  }
}
```

#### High Security Project
```json
{
  "verification": {
    "enabled": true,
    "default_tier": 2,
    "tier_overrides": {
      "api": 3,
      "auth": 3,
      "database": 3,
      "payment": 3
    },
    "sequential_for_tier_3": true,
    "required_specialists": ["code-reviewer", "qa-expert"],
    "fail_on_missing_required": true
  }
}
```

#### Quick Prototyping
```json
{
  "verification": {
    "enabled": false
  }
}
```

## Verification Brief Structure

When verification runs, a brief is generated for each specialist:

```markdown
# Verification Brief

## Task: [task name]
**Plan:** [plan_id]
**Type:** [task_type]
**Tier:** [tier] ([reason])

## What was built
[Description of implementation]

## Files modified
[List of modified files]

## Verification focus
Based on Tier [N], focus on:
- [Tier-specific focus points]

## Success criteria from plan
[Extracted done criteria]
```

## Integration with CI/CD

The verification system can be integrated with CI/CD pipelines:

1. **Pre-commit hooks:** Run Tier 1 verification before commits
2. **PR checks:** Run Tier 2 verification on pull requests
3. **Deploy gates:** Run Tier 3 verification before production deploys

Example GitHub Action:
```yaml
- name: Run GSD Verification
  env:
    VERIFICATION_TIER: 2
  run: |
    gsd verify-phase ${{ github.event.pull_request.head.ref }}
```

## Troubleshooting

### Verification Always Skipped
- Check `.planning/config.json` - ensure `verification.enabled: true`
- Check environment - ensure `SKIP_VERIFICATION` is not set
- Check specialists availability - run `gsd-tools agents enumerate`

### Specialist Not Found
- Regenerate agent roster: `gsd-tools agents enumerate --output .planning/available_agents.md`
- Check specialist spelling in config matches available agents
- Ensure VoltAgent is properly configured

### Verification Too Slow
- Consider reducing default tier for non-critical phases
- Use `tier_overrides` to target specific high-risk areas
- Enable parallel verification for Tier 2 (default)

### Too Many False Positives
- Review specialist focus areas - may need tuning
- Consider using WARNING instead of FAIL for style issues
- Update verification brief template with clearer guidelines