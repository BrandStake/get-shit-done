/**
 * Agents — VoltAgent specialist enumeration and discovery
 *
 * Purpose: Enable orchestrators to enumerate available specialists from voltagent plugins
 * and ~/.claude/agents/ for validation before spawning.
 *
 * Dynamically reads from ~/.claude/plugins/marketplaces/voltagent-subagents/categories/
 * to discover installed VoltAgent specialists.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { output, error } = require('./core.cjs');

/**
 * Category mapping from plugin folder names to display info
 */
const CATEGORY_MAP = {
  '01-core-development': { key: 'core-dev', title: '### Core Development', prefix: 'voltagent-core-dev' },
  '02-language-specialists': { key: 'lang', title: '### Language', prefix: 'voltagent-lang' },
  '03-infrastructure': { key: 'infra', title: '### Infrastructure', prefix: 'voltagent-infra' },
  '04-quality-security': { key: 'qa-sec', title: '### QA & Security', prefix: 'voltagent-qa-sec' },
  '05-data-ai': { key: 'data-ai', title: '### Data & AI', prefix: 'voltagent-data-ai' },
  '06-developer-experience': { key: 'dev-exp', title: '### Developer Experience', prefix: 'voltagent-dev-exp' },
  '07-specialized-domains': { key: 'domains', title: '### Specialized Domains', prefix: 'voltagent-domains' },
  '08-business-product': { key: 'biz', title: '### Business & Product', prefix: 'voltagent-biz' },
  '09-meta-orchestration': { key: 'meta', title: '### Meta & Orchestration', prefix: 'voltagent-meta' },
  '10-research-analysis': { key: 'research', title: '### Research & Analysis', prefix: 'voltagent-research' },
};

/**
 * Dynamically enumerate VoltAgent specialists from installed plugins
 * @returns {Array<Object>} - Array of {name, description, category} objects
 */
function enumerateVoltAgents() {
  const pluginsDir = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'voltagent-subagents', 'categories');

  if (!fs.existsSync(pluginsDir)) {
    // Fallback: plugins not installed, return empty
    return [];
  }

  const agents = [];

  try {
    const categories = fs.readdirSync(pluginsDir);

    for (const categoryDir of categories) {
      const categoryPath = path.join(pluginsDir, categoryDir);
      const pluginJsonPath = path.join(categoryPath, '.claude-plugin', 'plugin.json');

      if (!fs.existsSync(pluginJsonPath)) continue;

      try {
        const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        const categoryInfo = CATEGORY_MAP[categoryDir];

        if (!categoryInfo || !pluginJson.agents) continue;

        // Get prefix from plugin.json name field (e.g., "voltagent-lang")
        const prefix = pluginJson.name || categoryInfo.prefix;

        for (const agentRef of pluginJson.agents) {
          // agentRef is like "./python-pro.md"
          const agentFilename = agentRef.replace('./', '').replace('.md', '');
          const agentMdPath = path.join(categoryPath, agentRef.replace('./', ''));

          // Try to get description from .md file frontmatter
          let description = 'Specialist agent';
          if (fs.existsSync(agentMdPath)) {
            try {
              const content = fs.readFileSync(agentMdPath, 'utf-8');
              const descMatch = content.match(/^description:\s*["']?([^"'\n]+)["']?/m);
              if (descMatch) {
                description = descMatch[1].trim();
                // Truncate long descriptions
                if (description.length > 100) {
                  description = description.substring(0, 97) + '...';
                }
              }
            } catch (e) {
              // Ignore read errors, use default description
            }
          }

          agents.push({
            name: `${prefix}:${agentFilename}`,
            description,
            category: categoryInfo.key,
          });
        }
      } catch (e) {
        // Ignore JSON parse errors for individual categories
        console.error(`Warning: Could not parse ${pluginJsonPath}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`Error enumerating VoltAgent plugins: ${e.message}`);
  }

  return agents;
}

// Cache for VOLT_AGENTS (lazy-loaded)
let _voltAgentsCache = null;

/**
 * Get VoltAgent specialists (dynamically enumerated, cached)
 * @returns {Array<Object>} - Array of {name, description, category}
 */
function getVoltAgents() {
  if (_voltAgentsCache === null) {
    _voltAgentsCache = enumerateVoltAgents();
  }
  return _voltAgentsCache;
}

/**
 * Clear the VoltAgent cache (for testing or after plugin changes)
 */
function clearVoltAgentCache() {
  _voltAgentsCache = null;
}

// For backwards compatibility, expose as VOLT_AGENTS getter
Object.defineProperty(module.exports, 'VOLT_AGENTS', {
  get: function() {
    return getVoltAgents();
  }
});

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
 * @param {Array<Object>} fileAgents - Array of agent metadata from .md files
 * @param {string} timestamp - ISO timestamp for generation time
 * @returns {string} - Markdown content
 */
function generateAvailableAgentsMd(fileAgents, timestamp) {
  const lines = [];
  const voltAgents = getVoltAgents();

  lines.push('# Available Specialists');
  lines.push('');
  lines.push(`_Generated: ${timestamp}_`);
  lines.push('');

  // Section 1: VoltAgent Built-in Specialists (dynamically discovered)
  lines.push('## VoltAgent Specialists (Installed Plugins)');
  lines.push('');
  lines.push('These specialists are available via Claude Code Task tool. Use the full name as `specialist:` value.');
  lines.push('');

  // Build categories dynamically from CATEGORY_MAP
  const categories = {};
  for (const [dirName, info] of Object.entries(CATEGORY_MAP)) {
    categories[info.key] = { title: info.title, agents: [] };
  }

  for (const agent of voltAgents) {
    if (categories[agent.category]) {
      categories[agent.category].agents.push(agent);
    }
  }

  // Output in order defined by CATEGORY_MAP
  for (const [dirName, info] of Object.entries(CATEGORY_MAP)) {
    const cat = categories[info.key];
    if (cat && cat.agents.length > 0) {
      lines.push(cat.title);
      // Sort agents alphabetically within category
      cat.agents.sort((a, b) => a.name.localeCompare(b.name));
      for (const agent of cat.agents) {
        lines.push(`- \`${agent.name}\`: ${agent.description}`);
      }
      lines.push('');
    }
  }

  // Section 2: File-based agents (from ~/.claude/agents/)
  if (fileAgents.length > 0) {
    lines.push('## Custom Specialists (from ~/.claude/agents/)');
    lines.push('');

    const sorted = fileAgents.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of sorted) {
      lines.push(`- **${agent.name}**: ${agent.description}`);
    }
    lines.push('');
  }

  // Usage section
  lines.push('## Usage');
  lines.push('');
  lines.push('Reference specialists in PLAN.md task frontmatter:');
  lines.push('');
  lines.push('```yaml');
  lines.push('specialist: voltagent-lang:python-pro');
  lines.push('```');
  lines.push('');
  lines.push('For custom agents:');
  lines.push('```yaml');
  lines.push('specialist: code-reviewer');
  lines.push('```');
  lines.push('');
  lines.push('The executor will spawn the specialist for task execution. If unavailable, falls back to direct execution.');
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
    const voltAgents = getVoltAgents();
    const totalCount = voltAgents.length + agents.length;
    console.log(`Generated: ${output_path} (${voltAgents.length} volt + ${agents.length} custom = ${totalCount} specialists)`);
  } catch (err) {
    error(`Failed to write ${output_path}: ${err.message}`);
  }
}

/**
 * Determine verification tier based on task characteristics
 * @param {string} taskDescription - Description of the task
 * @param {string} fileList - Comma-separated list of files modified
 * @param {Object} options - Additional options {checkAvailable: boolean, overrideTier: number}
 * @returns {Object} - {tier: number, reason: string, specialists: Array<string>}
 */
function determineVerificationTier(taskDescription, fileList, options = {}) {
  // Check for explicit tier override first
  if (options.overrideTier !== undefined && options.overrideTier !== null) {
    const tier = parseInt(options.overrideTier, 10);
    if (tier === 0) {
      return {
        tier: 0,
        reason: 'Explicitly skipped via verification_tier=0',
        specialists: []
      };
    } else if (tier === 1) {
      return {
        tier: 1,
        reason: 'Explicitly set to Tier 1 via verification_tier',
        specialists: ['voltagent-qa-sec:code-reviewer']
      };
    } else if (tier === 2) {
      return {
        tier: 2,
        reason: 'Explicitly set to Tier 2 via verification_tier',
        specialists: ['voltagent-qa-sec:code-reviewer', 'voltagent-qa-sec:qa-expert']
      };
    } else if (tier === 3) {
      return {
        tier: 3,
        reason: 'Explicitly set to Tier 3 via verification_tier',
        specialists: ['voltagent-qa-sec:code-reviewer', 'voltagent-qa-sec:qa-expert', 'voltagent-infra:security-engineer']
      };
    }
  }

  const description = (taskDescription || '').toLowerCase();
  const files = (fileList || '').toLowerCase();
  const combined = `${description} ${files}`;

  // Tier 0: Documentation only - skip verification
  const tier0Keywords = [
    'readme', 'documentation', 'docs only', 'comment', 'changelog'
  ];

  // Tier 3: Critical paths requiring full verification team (security-focused)
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

  // Check for tier 0 keywords (docs only)
  for (const keyword of tier0Keywords) {
    if (combined.includes(keyword) && !combined.match(/\.(py|js|ts|go|rs|java|rb|php)$/)) {
      return {
        tier: 0,
        reason: `Documentation only: ${keyword}`,
        specialists: []
      };
    }
  }

  // Check for tier 3 keywords (security/critical)
  for (const keyword of tier3Keywords) {
    if (combined.includes(keyword)) {
      return {
        tier: 3,
        reason: `Critical path detected: ${keyword}`,
        specialists: ['voltagent-qa-sec:code-reviewer', 'voltagent-qa-sec:qa-expert', 'voltagent-infra:security-engineer']
      };
    }
  }

  // Check for tier 2 keywords (standard features)
  for (const keyword of tier2Keywords) {
    if (combined.includes(keyword)) {
      return {
        tier: 2,
        reason: `Standard feature detected: ${keyword}`,
        specialists: ['voltagent-qa-sec:code-reviewer', 'voltagent-qa-sec:qa-expert']
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
    specialists: ['voltagent-qa-sec:code-reviewer']
  };
}

/**
 * CLI command: determine verification tier for a task
 * @param {string} taskDescription - Task description
 * @param {string} fileList - File list (comma-separated or space-separated)
 * @param {boolean} checkAvailable - Check if specialists are available
 * @param {number} overrideTier - Override tier from task attribute
 * @param {boolean} raw - Output raw JSON
 */
function cmdDetermineVerificationTier(taskDescription, fileList, checkAvailable = false, overrideTier = null, raw = false) {
  // Handle both comma and space separated file lists
  const normalizedFiles = (fileList || '').replace(/,/g, ' ');

  const result = determineVerificationTier(taskDescription, normalizedFiles, {
    checkAvailable,
    overrideTier
  });

  // Use the output function which handles JSON serialization
  output(result, raw);
}

module.exports = {
  // VOLT_AGENTS is defined as a getter above for backwards compatibility
  CATEGORY_MAP,
  cmdEnumerateAgents,
  cmdDetermineVerificationTier,
  enumerateAgents,
  enumerateVoltAgents,
  getVoltAgents,
  clearVoltAgentCache,
  extractAgentMetadata,
  filterGsdSystemAgents,
  generateAvailableAgentsMd,
  determineVerificationTier,
};
