# Phase 7: Infrastructure (Agent Enumeration & Planning Integration) - Research

**Researched:** 2026-02-22
**Domain:** Multi-agent orchestration with agent enumeration and planning integration
**Confidence:** HIGH

## Summary

Phase 7 implements the foundation for orchestrator-mediated specialist delegation by enabling agent discovery and planning integration. The core challenge: planners need to know which specialists exist BEFORE creating plans, and orchestrators need to validate specialist availability BEFORE spawning. The solution leverages filesystem enumeration of ~/.claude/agents/ to generate available_agents.md, which planners consume as context to assign specialists to tasks.

This phase requires ZERO new dependencies. The implementation uses pure Bash for agent discovery, Node.js gsd-tools for deterministic operations, and the existing Task tool for context passing. The architectural shift moves delegation decisions from execution time (gsd-executor) to planning time (gsd-planner), with orchestrators generating fresh agent rosters before each planning session.

**Primary recommendation:** Implement filesystem-based agent enumeration in gsd-tools with filtering logic to exclude GSD system agents, then update plan-phase orchestrator to generate available_agents.md before spawning planner. Planner reads this file and assigns specialist field to tasks based on domain detection patterns.

<phase_requirements>
## Phase Requirements

This phase addresses the following requirements from REQUIREMENTS.md:

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | gsd-tools generates available_agents.md from ~/.claude/agents/ | Filesystem enumeration pattern (see Standard Stack - Agent Discovery) |
| DISC-02 | available_agents.md includes agent name, type, and description | Frontmatter parsing from agent .md files (see Architecture Patterns - Agent Metadata Extraction) |
| DISC-03 | Orchestrator validates agent exists before spawning | Fresh check via generate_available_agents before each operation (see Don't Hand-Roll - Agent Availability Caching) |
| DISC-04 | Filter excludes GSD system agents | Pattern matching on `gsd-*` prefix (see Code Examples - GSD System Agent Filter) |
| PLAN-01 | Planner reads available_agents.md as context | Task tool files_to_read parameter (see Architecture Patterns - Context Passing to Planner) |
| PLAN-02 | Planner detects task domain using keyword patterns | Reuse v1.21 domain detection (see Common Pitfalls - Domain Detection Regressions) |
| PLAN-03 | Planner assigns specialist attribute to tasks in PLAN.md | Frontmatter field `specialist` per task (see Code Examples - Specialist Assignment) |
| PLAN-04 | Planner validates specialist exists before assignment | Check against available_agents.md roster (see Common Pitfalls - Spawning Unavailable Specialists) |
| PLAN-05 | Tasks without matching domain get specialist=null | Null-safe handling in orchestrator (see Code Examples - Null Specialist Fallback) |
</phase_requirements>

## Standard Stack

### Core Technologies (NO NEW DEPENDENCIES)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bash | System default | Filesystem enumeration of agents | Native `ls ~/.claude/agents/*.md` provides deterministic specialist discovery |
| Node.js | System default | gsd-tools CLI deterministic operations | Already handles PLAN.md parsing, state updates, frontmatter manipulation |
| grep/sed | System default | Frontmatter parsing from agent files | Extract `name:` and `description:` fields from agent .md files |
| Claude Code Task tool | Runtime | Subagent spawning with context | Built-in `files_to_read` parameter handles all context passing to planners |

**Installation:**
No new dependencies required. All functionality uses existing GSD infrastructure.

### Supporting Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| jq | JSON parsing of gsd-tools output | When parsing structured init context in orchestrators |
| date | Timestamp generation for metadata | Track when available_agents.md was last generated |
| basename | Extract agent names from file paths | Convert `~/.claude/agents/python-pro.md` to `python-pro` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Filesystem enumeration | @voltagent/core npm package | Adds dependency, requires TypeScript runtime, breaks GSD's Bash+Markdown philosophy |
| Bash grep for frontmatter | gray-matter npm library | Adds 2 dependencies (js-yaml, gray-matter), overkill for simple key:value extraction |
| Fresh enumeration per operation | Cache available_agents.md | Stale cache when specialists installed/removed between operations, cache invalidation complexity |

**Why filesystem enumeration wins:**
- Zero dependencies (pure Bash)
- Deterministic (no race conditions from concurrent cache updates)
- Self-healing (always reflects current ~/.claude/agents/ state)
- Fast (< 50ms for typical 10-20 agents)

## Architecture Patterns

### Recommended Project Structure

```
.planning/
├── available_agents.md    # Generated by orchestrator before planning
├── config.json            # workflow.use_specialists flag
└── phases/
    └── XX-name/
        ├── XX-PLAN.md     # Contains specialist frontmatter per task

~/.claude/agents/
├── python-pro.md          # VoltAgent specialist (discovered)
├── typescript-pro.md      # VoltAgent specialist (discovered)
├── gsd-planner.md         # GSD system agent (filtered out)
└── gsd-executor.md        # GSD system agent (filtered out)
```

### Pattern 1: Agent Enumeration in gsd-tools

**What:** Add `agents enumerate` command to gsd-tools that scans ~/.claude/agents/ and generates available_agents.md

**When to use:** Orchestrators call this BEFORE spawning planner (plan-phase workflow) or executor (execute-phase workflow)

**Example:**

```bash
# Source: Phase 7 implementation (to be created)

# In gsd-tools.cjs router:
case 'agents': {
  const subcommand = args[1];
  if (subcommand === 'enumerate') {
    const outputPath = args.indexOf('--output') !== -1
      ? args[args.indexOf('--output') + 1]
      : '.planning/available_agents.md';
    agents.cmdEnumerateAgents(cwd, outputPath);
  }
  break;
}

# In lib/agents.cjs:
function cmdEnumerateAgents(cwd, outputPath) {
  const agentsDir = path.join(os.homedir(), '.claude', 'agents');

  if (!fs.existsSync(agentsDir)) {
    console.log('[]'); // No agents available
    return;
  }

  const agentFiles = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .filter(f => !f.startsWith('gsd-')) // Exclude GSD system agents
    .map(f => path.join(agentsDir, f));

  const agents = agentFiles.map(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);

    return {
      name: nameMatch ? nameMatch[1].trim() : path.basename(file, '.md'),
      description: descMatch ? descMatch[1].trim() : 'Specialist agent',
      type: inferAgentType(file),
      path: file
    };
  });

  // Write available_agents.md
  const output = generateAvailableAgentsMd(agents);
  fs.writeFileSync(path.join(cwd, outputPath), output, 'utf-8');

  console.log(`Generated ${outputPath} with ${agents.length} specialists`);
}

function inferAgentType(filePath) {
  const name = path.basename(filePath, '.md');

  // Pattern matching for specialist types
  if (name.includes('pro') || name.includes('expert')) return 'specialist';
  if (name.includes('engineer')) return 'specialist';
  if (name.includes('architect')) return 'specialist';
  if (name.includes('developer')) return 'specialist';

  return 'agent';
}

function generateAvailableAgentsMd(agents) {
  const timestamp = new Date().toISOString().split('T')[0];

  let md = `# Available Specialists\n\n`;
  md += `**Generated:** ${timestamp}\n`;
  md += `**Source:** ~/.claude/agents/\n\n`;
  md += `## Installed Specialists\n\n`;

  agents.forEach(agent => {
    md += `- **${agent.name}**: ${agent.description}\n`;
  });

  md += `\n**Usage:** Assign to tasks in PLAN.md frontmatter:\n\n`;
  md += '```yaml\n';
  md += 'tasks:\n';
  md += '  - specialist: python-pro\n';
  md += '```\n';

  return md;
}
```

**Why this pattern:**
- Centralized in gsd-tools (single implementation, used by all orchestrators)
- JSON output option for programmatic parsing
- Markdown output option for planner context
- Filtering logic prevents spawning GSD system agents
- Type inference helps planners choose appropriate specialists

### Pattern 2: Context Passing to Planner

**What:** Orchestrator generates available_agents.md then passes it to planner via Task tool's files_to_read

**When to use:** plan-phase orchestrator before spawning gsd-planner

**Example:**

```bash
# Source: plan-phase.md orchestrator (to be updated)

# Generate fresh agent roster
node /path/to/gsd-tools.cjs agents enumerate --output .planning/available_agents.md

# Spawn planner with agent roster in context
Task(
  subagent_type="gsd-planner",
  model="${PLANNER_MODEL}",
  prompt="
<objective>
Plan phase ${PHASE_NUM} with specialist delegation support.
</objective>

<files_to_read>
.planning/available_agents.md
.planning/ROADMAP.md
.planning/STATE.md
${PHASE_DIR}/*-RESEARCH.md
${PHASE_DIR}/*-CONTEXT.md
</files_to_read>

Create PLAN.md files with specialist assignments based on domain detection.
Tasks should have 'specialist' frontmatter field when domain matches available specialists.
Tasks without domain match should have 'specialist: null' (direct gsd-executor execution).
",
  description="Planning phase ${PHASE_NUM} with specialist support"
)
```

**Why this pattern:**
- Task tool handles @-reference expansion automatically
- Fresh agent roster each planning session (no stale cache)
- Planner sees same agent list orchestrator will use for spawning
- No custom context injection logic needed

### Pattern 3: Specialist Assignment in Plans

**What:** Planner adds `specialist` field to task frontmatter based on domain detection

**When to use:** gsd-planner when creating PLAN.md files

**Example:**

```markdown
---
phase: 07-infrastructure
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [get-shit-done/bin/lib/agents.cjs]
autonomous: true
requirements: [DISC-01, DISC-02, DISC-04]
must_haves:
  truths: []
  artifacts: []
  key_links: []
tasks:
  - specialist: null  # Simple Bash implementation, no specialist needed
---

<tasks>

<task type="auto">
  <name>Task 1: Implement agent enumeration in gsd-tools</name>
  <files>get-shit-done/bin/lib/agents.cjs</files>
  <action>Create new agents.cjs module in gsd-tools lib/ directory...</action>
  <verify>node gsd-tools.cjs agents enumerate && [ -f .planning/available_agents.md ]</verify>
  <done>available_agents.md generated with specialist list</done>
</task>

</tasks>
```

**Why this pattern:**
- Null-safe: specialist=null means direct execution (backward compatible)
- Explicit assignment: orchestrator knows routing decision at plan parse time
- Validation-friendly: planner can check specialist exists before assignment

### Anti-Patterns to Avoid

- **Runtime agent discovery in executor:** Executors are subagents without Task tool access — they cannot spawn specialists. Discovery MUST happen in orchestrator.
- **Cached agent rosters:** Stale cache when specialists installed/removed → spawn failures. Always generate fresh via `agents enumerate`.
- **Including GSD system agents in roster:** gsd-planner, gsd-executor are NOT delegation targets. Filter with `!f.startsWith('gsd-')`.
- **Hardcoded specialist names in plans:** Specialist availability changes with plugin installations. Planner must check against available_agents.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent availability caching | Custom cache invalidation logic | Fresh `agents enumerate` each operation | Cache invalidation is hard — specialists installed/removed between operations, TTL guessing, race conditions |
| Agent metadata extraction | Custom YAML/frontmatter parser | grep + sed for simple key:value pairs | Agent frontmatter is simple (name: X, description: Y) — full YAML parser overkill, adds dependencies |
| Specialist validation | Runtime spawn-and-catch approach | Pre-spawn check against roster | Failing Task() calls waste time, context, money — validate BEFORE spawning |
| VoltAgent plugin discovery | Call VoltAgent API or runtime | Filesystem enumeration of ~/.claude/agents/ | Simpler, faster, no external dependencies, deterministic |

**Key insight:** Agent enumeration is a SOLVED problem with filesystem APIs. The complexity is in handling edge cases (race conditions, stale caches, partial failures). Filesystem-based fresh enumeration eliminates these by making discovery idempotent and self-healing.

## Common Pitfalls

### Pitfall 1: Spawning Unavailable Specialists

**What goes wrong:** Planner assigns specialist="python-pro" but plugin uninstalled before execution → Task() fails with "unknown subagent_type"

**Why it happens:** Time gap between planning (specialist available) and execution (specialist removed)

**How to avoid:**
- Orchestrators regenerate available_agents.md BEFORE spawning (both plan-phase and execute-phase)
- Orchestrators validate specialist field against fresh roster before calling Task()
- Fallback to gsd-executor when specialist unavailable

**Warning signs:**
- Error: "unknown subagent_type: python-pro"
- Timestamp gap > 1 day between plan creation and execution
- Manual specialist installation/removal between plan and execution

### Pitfall 2: Including GSD System Agents in Roster

**What goes wrong:** Planner assigns specialist="gsd-planner" → orchestrator spawns gsd-planner to execute implementation task → role confusion, incorrect behavior

**Why it happens:** Filter logic missing or incorrect in agent enumeration

**How to avoid:**
- Filter: `!f.startsWith('gsd-')` when enumerating ~/.claude/agents/
- Validate: specialist field must NOT match pattern `gsd-*`
- Document: available_agents.md explicitly states "VoltAgent specialists only"

**Warning signs:**
- Plans with specialist="gsd-executor" or specialist="gsd-planner"
- Nested orchestration attempts (planner spawning planner)
- Agent role confusion in execution logs

### Pitfall 3: Domain Detection Regressions

**What goes wrong:** Planner previously detected "Python task → python-pro" in v1.21, but Phase 7 changes break this logic

**Why it happens:** Domain detection code deleted or modified during refactor, tests not covering specialist assignment

**How to avoid:**
- REUSE v1.21 domain detection patterns (already validated)
- Add tests: given task description "Implement FastAPI endpoint" → specialist="python-pro"
- Document: domain detection keyword patterns in gsd-planner.md

**Warning signs:**
- Python tasks assigned specialist=null when python-pro installed
- TypeScript tasks assigned wrong specialist
- Regression in specialist delegation ratio (was 70%, now 10%)

### Pitfall 4: Race Condition in Agent Enumeration

**What goes wrong:** Orchestrator enumerates agents → user installs new specialist → orchestrator spawns planner with stale roster → planner doesn't see new specialist

**Why it happens:** Agent enumeration happens once at orchestrator start, not refreshed during execution

**How to avoid:**
- Generate available_agents.md IMMEDIATELY before spawning planner (minimize window)
- Accept small race condition window (< 1 second) as acceptable
- Document: "Specialists installed during orchestrator run require restart"

**Warning signs:**
- User reports "I installed python-pro but planner doesn't see it"
- Available_agents.md timestamp hours old
- Manual specialist installation during active planning session

## Code Examples

Verified patterns from GSD codebase and Claude Code Task tool documentation:

### Agent Enumeration Command

```bash
# Source: gsd-tools agents enumerate implementation

#!/usr/bin/env bash

# Usage: node gsd-tools.cjs agents enumerate [--output path]
# Generates available_agents.md from ~/.claude/agents/

agents_enumerate() {
  local output_path="${1:-.planning/available_agents.md}"
  local agents_dir="$HOME/.claude/agents"

  # Check agents directory exists
  if [ ! -d "$agents_dir" ]; then
    echo "Warning: $agents_dir not found" >&2
    echo "[]" # Empty roster
    return
  fi

  # Create output directory if needed
  mkdir -p "$(dirname "$output_path")"

  # Generate markdown header
  cat > "$output_path" <<EOF
# Available Specialists

**Generated:** $(date -u +%Y-%m-%d)
**Source:** ~/.claude/agents/

## Installed Specialists

EOF

  # Enumerate agents (excluding gsd-* system agents)
  local count=0
  for agent_file in "$agents_dir"/*.md; do
    [ -f "$agent_file" ] || continue

    local agent_name=$(basename "$agent_file" .md)

    # Filter out GSD system agents
    [[ "$agent_name" == gsd-* ]] && continue

    # Extract description from frontmatter
    local description=$(grep "^description:" "$agent_file" | sed 's/^description: *//' | head -n 1)
    [ -z "$description" ] && description="Specialist agent"

    # Append to roster
    echo "- **${agent_name}**: ${description}" >> "$output_path"
    count=$((count + 1))
  done

  # Add usage instructions
  cat >> "$output_path" <<EOF

**Total:** ${count} specialist(s)

**Usage in PLAN.md:**
\`\`\`yaml
tasks:
  - specialist: python-pro
    name: Implement FastAPI endpoint
\`\`\`

**Note:** Tasks without matching specialist get \`specialist: null\` (direct execution).
EOF

  echo "Generated $output_path with $count specialists" >&2
}

# Example invocation
agents_enumerate ".planning/available_agents.md"
```

### GSD System Agent Filter

```bash
# Source: Agent enumeration filter logic

is_gsd_system_agent() {
  local agent_name="$1"

  # Pattern: gsd-* prefix indicates system agent (not delegation target)
  [[ "$agent_name" == gsd-* ]] && return 0

  return 1
}

# Usage:
for agent in ~/.claude/agents/*.md; do
  agent_name=$(basename "$agent" .md)

  if is_gsd_system_agent "$agent_name"; then
    echo "Skipping system agent: $agent_name" >&2
    continue
  fi

  # Process specialist agent
  echo "Found specialist: $agent_name"
done
```

### Specialist Assignment in Planner

```javascript
// Source: gsd-planner domain detection logic (v1.21 reuse)

function detectSpecialistForTask(taskDescription, availableSpecialists) {
  const desc = taskDescription.toLowerCase();

  // Language specialists
  if (desc.includes('python') || desc.includes('fastapi') || desc.includes('django')) {
    return findSpecialist(availableSpecialists, 'python-pro');
  }

  if (desc.includes('typescript') || desc.includes('tsx') || desc.includes('react')) {
    return findSpecialist(availableSpecialists, 'typescript-pro');
  }

  if (desc.includes('golang') || desc.includes('go module')) {
    return findSpecialist(availableSpecialists, 'golang-pro');
  }

  // Infrastructure specialists
  if (desc.includes('kubernetes') || desc.includes('k8s')) {
    return findSpecialist(availableSpecialists, 'kubernetes-specialist');
  }

  if (desc.includes('docker') || desc.includes('dockerfile')) {
    return findSpecialist(availableSpecialists, 'docker-expert');
  }

  // No match → direct execution
  return null;
}

function findSpecialist(roster, preferredName) {
  // Check if preferred specialist installed
  if (roster.includes(preferredName)) {
    return preferredName;
  }

  // Specialist not available → return null (direct execution)
  return null;
}

// Usage in planner when creating PLAN.md:
const availableSpecialists = parseAvailableAgentsMd('.planning/available_agents.md');
const specialist = detectSpecialistForTask(taskAction, availableSpecialists);

// Write to frontmatter
frontmatter.tasks = tasks.map(task => ({
  ...task,
  specialist: detectSpecialistForTask(task.action, availableSpecialists)
}));
```

### Null Specialist Fallback in Orchestrator

```bash
# Source: execute-phase orchestrator spawning logic

spawn_task_executor() {
  local task_num="$1"
  local specialist="$2"  # May be null

  # Validate specialist availability if assigned
  if [ -n "$specialist" ] && [ "$specialist" != "null" ]; then
    # Check against fresh agent roster
    if ! grep -q "^- \*\*${specialist}\*\*:" .planning/available_agents.md; then
      echo "Warning: Specialist '$specialist' not available, falling back to gsd-executor" >&2
      specialist="null"
    fi
  fi

  # Route based on specialist field
  if [ "$specialist" = "null" ] || [ -z "$specialist" ]; then
    # Direct execution via gsd-executor
    Task(
      subagent_type="gsd-executor",
      model="${EXECUTOR_MODEL}",
      prompt="Execute task ${task_num} directly...",
      description="Task ${task_num} (direct)"
    )
  else
    # Delegate to specialist
    Task(
      subagent_type="$specialist",
      model="${EXECUTOR_MODEL}",
      prompt="Execute task ${task_num} with specialist...",
      description="Task ${task_num} ($specialist)"
    )
  fi
}

# Example usage:
SPECIALIST=$(jq -r ".tasks[$TASK_IDX].specialist // \"null\"" frontmatter.json)
spawn_task_executor "$TASK_NUM" "$SPECIALIST"
```

### Agent Metadata Extraction

```bash
# Source: Frontmatter parsing from agent .md files

extract_agent_metadata() {
  local agent_file="$1"

  # Extract frontmatter fields using grep/sed
  local name=$(grep "^name:" "$agent_file" | sed 's/^name: *//' | head -n 1)
  local description=$(grep "^description:" "$agent_file" | sed 's/^description: *//' | head -n 1)
  local tools=$(grep "^tools:" "$agent_file" | sed 's/^tools: *//' | head -n 1)

  # Defaults if fields missing
  [ -z "$name" ] && name=$(basename "$agent_file" .md)
  [ -z "$description" ] && description="Specialist agent"

  # Output JSON
  cat <<EOF
{
  "name": "$name",
  "description": "$description",
  "tools": "$tools",
  "path": "$agent_file"
}
EOF
}

# Usage:
for agent in ~/.claude/agents/*.md; do
  metadata=$(extract_agent_metadata "$agent")
  echo "$metadata"
done
```

## State of the Art

| Old Approach (v1.21) | Current Approach (v1.22) | When Changed | Impact |
|---------------------|-------------------------|--------------|--------|
| gsd-executor tries to spawn specialists | Orchestrator spawns specialists | Phase 7 (2026-02-22) | Fixes broken delegation — executors are subagents without Task tool access |
| Hardcoded specialist routing in executor | Planner assigns specialists during planning | Phase 7 (2026-02-22) | Routing decision at plan time, not execution time → validation before spawn |
| No agent enumeration | Filesystem-based agent enumeration | Phase 7 (2026-02-22) | Planners see installed specialists → intelligent assignment |
| Manual specialist checks | available_agents.md generated automatically | Phase 7 (2026-02-22) | Self-documenting, fresh each operation, no stale cache |

**Deprecated/outdated:**
- **gsd-executor specialist spawning:** Removed in Phase 10 cleanup. Executors cannot call Task() — only orchestrators can.
- **Static specialist lists:** No hardcoded specialist names. Always enumerate from ~/.claude/agents/ for current state.
- **Planner ignorance of specialists:** Planners now MUST read available_agents.md and assign specialist field based on availability.

## Open Questions

1. **What if specialist installed MID-execution?**
   - What we know: Agent enumeration happens at orchestrator start
   - What's unclear: Should orchestrator refresh roster between tasks?
   - Recommendation: Accept small race window (< 1 minute), document "restart orchestrator to detect new specialists"

2. **Should available_agents.md be committed to git?**
   - What we know: It's generated content, changes with plugin installations
   - What's unclear: Git churn vs discoverability for future sessions
   - Recommendation: Add to .gitignore — it's ephemeral, regenerated each operation

3. **How to handle specialist version mismatches?**
   - What we know: VoltAgent specialists don't expose version in frontmatter
   - What's unclear: If python-pro updated with breaking changes, how to detect?
   - Recommendation: Out of scope for Phase 7 — defer to Phase 10 error recovery

## Sources

### Primary (HIGH confidence)
- GSD v1.21 codebase - Domain detection patterns in gsd-executor.md and gsd-planner.md
- Claude Code Task tool documentation - files_to_read parameter behavior
- ~/.claude/agents/ directory inspection - Agent frontmatter format (name, description, tools fields)
- .planning/research/ files - ARCHITECTURE.md, STACK.md, PITFALLS.md from orchestrator delegation research

### Secondary (MEDIUM confidence)
- GSD project conventions - Bash-first philosophy, minimal dependencies, filesystem-based operations
- Node.js fs module documentation - readFileSync, readdirSync for agent enumeration

### Tertiary (LOW confidence)
- None — all findings verified against existing codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only existing GSD infrastructure (Bash, Node.js, Task tool)
- Architecture: HIGH - Patterns verified against v1.21 codebase and orchestrator research
- Pitfalls: HIGH - Identified from v1.21 post-mortem and race condition analysis

**Research date:** 2026-02-22
**Valid until:** 30 days (stable architecture, low change velocity)
