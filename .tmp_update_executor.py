#!/usr/bin/env python3
import re

# Read the file
with open('agents/gsd-executor.md', 'r') as f:
    content = f.read()

# Task 1: Replace TODO placeholder with Task tool invocation
old_delegation = r'''   - \*\*If ROUTE_ACTION = "delegate":\*\*
     ```bash
     SPECIALIST="\$ROUTE_DETAIL"
     echo "→ Delegating task to: \$SPECIALIST"

     # Generate specialist prompt using adapter
     SPECIALIST_PROMPT=\$\(gsd_task_adapter "\$TASK_NAME" "\$TASK_FILES" "\$TASK_ACTION" "\$TASK_VERIFY" "\$TASK_DONE" "\$SPECIALIST"\)

     # TODO \(Phase 3\): Invoke specialist via Task tool
     # SPECIALIST_OUTPUT=\$\(invoke_task_tool "\$SPECIALIST" "\$SPECIALIST_PROMPT"\)
     # RESULT=\$\(gsd_result_adapter "\$SPECIALIST_OUTPUT" "\$TASK_FILES"\)

     # For Phase 1: Log delegation preparation
     echo "✓ Specialist prompt prepared \(delegation pending Phase 3 Task tool integration\)" >&2
     echo "  Specialist: \$SPECIALIST" >&2
     echo "  Files: \$TASK_FILES" >&2

     # Fall back to direct execution until Phase 3 complete
     echo "→ Executing directly \(Phase 3 Task tool not yet integrated\)" >&2
     ```'''

new_delegation = '''   - **If ROUTE_ACTION = "delegate":**
     ```bash
     SPECIALIST="$ROUTE_DETAIL"
     echo "→ Delegating task $TASK_NUM to: $SPECIALIST"

     # Generate specialist prompt using adapter
     SPECIALIST_PROMPT=$(gsd_task_adapter "$TASK_NAME" "$TASK_FILES" "$TASK_ACTION" "$TASK_VERIFY" "$TASK_DONE" "$SPECIALIST")

     # Build context injection list (CLAUDE.md, skills, task files)
     FILES_TO_READ="CLAUDE.md"

     # Add skills if they exist
     if [ -d .agents/skills ]; then
       FILES_TO_READ="$FILES_TO_READ .agents/skills/"
     fi

     # Add task-specific files
     if [ -n "$TASK_FILES" ]; then
       for file in $TASK_FILES; do
         FILES_TO_READ="$FILES_TO_READ $file"
       done
     fi

     # Invoke specialist via Task tool (identical pattern to gsd-executor invocation)
     SPECIALIST_OUTPUT=$(Task(
       subagent_type="$SPECIALIST",
       model="${EXECUTOR_MODEL}",
       prompt="
<task_context>
${SPECIALIST_PROMPT}
</task_context>

<files_to_read>
Read these files for context:
${FILES_TO_READ}

The Task tool will automatically load CLAUDE.md (project instructions and conventions) and .agents/skills/ (project-specific rules) into your context. Follow all project guidelines during execution.
</files_to_read>

Complete this task following GSD execution rules embedded in the task prompt. Return structured output with files modified, verification results, and any deviations from plan.
",
       description="Task ${PHASE}-${PLAN}-${TASK_NUM} (${SPECIALIST})"
     ))

     echo "✓ Specialist completed task" >&2

     # Check for checkpoint in specialist output (pass through unchanged)
     # Specialists use same checkpoint protocol as gsd-executor - no translation needed
     if echo "$SPECIALIST_OUTPUT" | grep -q "## CHECKPOINT REACHED"; then
       echo "→ Specialist returned checkpoint" >&2

       # Log checkpoint occurrence
       echo "$(date -u +%Y-%m-%d,%H:%M:%S),${PHASE}-${PLAN},Task $TASK_NUM,$TASK_NAME,$SPECIALIST,checkpoint" >> .planning/delegation.log

       # Pass through unchanged (specialists use same checkpoint protocol)
       echo "$SPECIALIST_OUTPUT"

       # Exit - orchestrator handles continuation
       return
     fi

     # Parse specialist output using result adapter
     RESULT=$(gsd_result_adapter "$SPECIALIST_OUTPUT" "$TASK_FILES")

     # Extract parsed fields for commit
     FILES_MODIFIED=$(echo "$RESULT" | jq -r '.files_modified[]' 2>/dev/null || echo "$TASK_FILES")
     VERIFICATION_STATUS=$(echo "$RESULT" | jq -r '.verification_status' 2>/dev/null || echo "completed")
     COMMIT_MESSAGE=$(echo "$RESULT" | jq -r '.commit_message' 2>/dev/null || echo "feat(${PHASE}-${PLAN}): ${TASK_NAME}")

     # Note: Specialist execution complete, proceed to commit step (section d below)
     ```'''

# Make the replacement
new_content = re.sub(old_delegation, new_delegation, content, flags=re.MULTILINE)

if new_content != content:
    with open('agents/gsd-executor.md', 'w') as f:
        f.write(new_content)
    print("SUCCESS: Task 1 complete - Task tool invocation added")
else:
    print("WARNING: No changes made - pattern may not match exactly")
    # Try to find the actual pattern
    if 'TODO (Phase 3)' in content:
        print("Found TODO comment - attempting simpler replacement")
        # Try simpler pattern
        idx = content.find('# TODO (Phase 3): Invoke specialist via Task tool')
        if idx > 0:
            # Find the start of this bash block
            start_idx = content.rfind('SPECIALIST="$ROUTE_DETAIL"', 0, idx)
            # Find the end (next triple backtick)
            end_idx = content.find('```', idx + 100)
            if start_idx > 0 and end_idx > 0:
                # Extract old code
                old_code = content[start_idx:end_idx].strip()
                print(f"Found old code from position {start_idx} to {end_idx}")
                print("First 100 chars:", old_code[:100])

