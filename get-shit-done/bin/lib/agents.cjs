/**
 * Agents — VoltAgent specialist enumeration and discovery
 *
 * Purpose: Enable orchestrators to enumerate available specialists from ~/.claude/agents/
 * and validate their availability before spawning.
 *
 * Fixes v1.21 broken delegation by moving specialist discovery to orchestrator layer
 * where Task tool access exists.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { output, error } = require('./core.cjs');

/**
 * Extract agent metadata from frontmatter in .md file
 * @param {string} filePath - Path to agent .md file
 * @returns {Object|null} - {name, description} or null if file unreadable
 */
function extractAgentMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract frontmatter using regex (no dependencies)
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);

    // Fallback: Use filename without extension if name missing
    const filename = path.basename(filePath, '.md');

    return {
      name: nameMatch ? nameMatch[1].trim() : filename,
      description: descMatch ? descMatch[1].trim() : 'Specialist agent',
      filename: filename,
    };
  } catch (err) {
    // If file unreadable, log warning and return null
    console.error(`Warning: Could not read agent metadata from ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Filter out GSD system agents (gsd-* prefix)
 * @param {Array<string>} agentFiles - Array of agent filenames
 * @returns {Array<string>} - Filtered array excluding gsd-* agents
 */
function filterGsdSystemAgents(agentFiles) {
  return agentFiles.filter(f => !f.startsWith('gsd-'));
}

/**
 * Enumerate agents from ~/.claude/agents/ directory
 * @param {string} agentsDir - Path to agents directory
 * @returns {Array<Object>} - Array of agent metadata objects
 */
function enumerateAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) {
    console.error(`Warning: Agents directory not found: ${agentsDir}`);
    return [];
  }

  try {
    // Read all .md files from agents directory
    const allFiles = fs.readdirSync(agentsDir);
    const agentFiles = allFiles.filter(f => f.endsWith('.md'));

    // Filter out GSD system agents
    const specialistFiles = filterGsdSystemAgents(agentFiles);

    // Extract metadata from each specialist file
    const agents = [];
    for (const file of specialistFiles) {
      const filePath = path.join(agentsDir, file);
      const metadata = extractAgentMetadata(filePath);
      if (metadata) {
        agents.push(metadata);
      }
    }

    return agents;
  } catch (err) {
    console.error(`Error enumerating agents: ${err.message}`);
    return [];
  }
}

/**
 * Generate available_agents.md markdown output
 * @param {Array<Object>} agents - Array of agent metadata
 * @param {string} timestamp - ISO timestamp for generation time
 * @returns {string} - Markdown content
 */
function generateAvailableAgentsMd(agents, timestamp) {
  const lines = [];

  lines.push('# Available Specialists');
  lines.push('');
  lines.push(`_Generated: ${timestamp}_`);
  lines.push('');

  if (agents.length === 0) {
    lines.push('No VoltAgent specialists found in `~/.claude/agents/`.');
    lines.push('');
    lines.push('To add specialists, install VoltAgent plugins:');
    lines.push('```bash');
    lines.push('claude plugin install voltagent-lang@voltagent-subagents');
    lines.push('claude plugin install voltagent-infra@voltagent-subagents');
    lines.push('```');
  } else {
    lines.push('## Installed Specialists');
    lines.push('');

    // Sort agents by name for consistent output
    const sorted = agents.slice().sort((a, b) => a.name.localeCompare(b.name));

    for (const agent of sorted) {
      lines.push(`- **${agent.name}**: ${agent.description}`);
    }

    lines.push('');
    lines.push('## Usage');
    lines.push('');
    lines.push('Reference specialists in PLAN.md task frontmatter:');
    lines.push('');
    lines.push('```yaml');
    lines.push('---');
    lines.push('specialist: python-pro');
    lines.push('---');
    lines.push('```');
    lines.push('');
    lines.push('The orchestrator will validate availability and spawn the specialist for task execution.');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Main CLI entry point: enumerate agents and generate available_agents.md
 * @param {string} cwd - Current working directory
 * @param {string} outputPath - Path to output file (default: .planning/available_agents.md)
 */
function cmdEnumerateAgents(cwd, outputPath) {
  // Default output path if not provided
  const output_path = outputPath || path.join(cwd, '.planning', 'available_agents.md');

  // Agents directory: ~/.claude/agents/
  const agentsDir = path.join(os.homedir(), '.claude', 'agents');

  // Enumerate agents
  const agents = enumerateAgents(agentsDir);

  // Generate markdown output
  const timestamp = new Date().toISOString();
  const markdown = generateAvailableAgentsMd(agents, timestamp);

  // Create output directory if doesn't exist
  const outputDir = path.dirname(output_path);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output file
  try {
    fs.writeFileSync(output_path, markdown, 'utf-8');
    console.log(`Generated: ${output_path} (${agents.length} specialists found)`);
  } catch (err) {
    error(`Failed to write ${output_path}: ${err.message}`);
  }
}

/**
 * Determine verification tier based on task characteristics
 * @param {string} taskDescription - Description of the task
 * @param {string} fileList - Comma-separated list of files modified
 * @param {Object} options - Additional options {checkAvailable: boolean}
 * @returns {Object} - {tier: number, reason: string, specialists: Array<string>}
 */
function determineVerificationTier(taskDescription, fileList, options = {}) {
  const description = (taskDescription || '').toLowerCase();
  const files = (fileList || '').toLowerCase();
  const combined = `${description} ${files}`;

  // Tier 3: Critical paths requiring full verification team
  const tier3Keywords = [
    'security', 'auth', 'authentication', 'authorization', 'oauth',
    'payment', 'billing', 'stripe', 'checkout', 'subscription',
    'database', 'migration', 'schema', 'production', 'deploy',
    'encryption', 'password', 'token', 'jwt', 'session',
    'vulnerability', 'csrf', 'xss', 'injection', 'sanitize'
  ];

  // Tier 2: Standard features requiring code review + QA
  const tier2Keywords = [
    'api', 'endpoint', 'route', 'controller', 'service',
    'business logic', 'validation', 'integration', 'webhook',
    'error handling', 'retry', 'circuit breaker', 'rate limit',
    'cache', 'redis', 'queue', 'worker', 'job',
    'test', 'coverage', 'e2e', 'integration test'
  ];

  // Check for tier 3 keywords
  for (const keyword of tier3Keywords) {
    if (combined.includes(keyword)) {
      return {
        tier: 3,
        reason: `Critical path detected: ${keyword}`,
        specialists: ['code-reviewer', 'qa-expert', 'principal-engineer']
      };
    }
  }

  // Check for tier 2 keywords
  for (const keyword of tier2Keywords) {
    if (combined.includes(keyword)) {
      return {
        tier: 2,
        reason: `Standard feature detected: ${keyword}`,
        specialists: ['code-reviewer', 'qa-expert']
      };
    }
  }

  // Check if available specialists exist (optional verification)
  if (options.checkAvailable) {
    const agentsDir = path.join(os.homedir(), '.claude', 'agents');
    const agents = enumerateAgents(agentsDir);
    const agentNames = agents.map(a => a.name);

    // If no code-reviewer available, skip verification
    if (!agentNames.includes('code-reviewer')) {
      return {
        tier: 0,
        reason: 'No verification specialists available',
        specialists: []
      };
    }
  }

  // Default to Tier 1: Light verification
  return {
    tier: 1,
    reason: 'Simple change - light review',
    specialists: ['code-reviewer']
  };
}

/**
 * CLI command: determine verification tier for a task
 * @param {string} taskDescription - Task description
 * @param {string} fileList - File list (comma-separated or space-separated)
 * @param {boolean} checkAvailable - Check if specialists are available
 * @param {boolean} raw - Output raw JSON
 */
function cmdDetermineVerificationTier(taskDescription, fileList, checkAvailable = false, raw = false) {
  // Handle both comma and space separated file lists
  const normalizedFiles = (fileList || '').replace(/,/g, ' ');

  const result = determineVerificationTier(taskDescription, normalizedFiles, {
    checkAvailable
  });

  // Use the output function which handles JSON serialization
  output(result, raw);
}

module.exports = {
  cmdEnumerateAgents,
  cmdDetermineVerificationTier,
  enumerateAgents,
  extractAgentMetadata,
  filterGsdSystemAgents,
  generateAvailableAgentsMd,
  determineVerificationTier,
};
