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
 * Built-in VoltAgent specialists available via Claude Code's Task tool.
 * These are registered as subagent_types, not .md files.
 * Keep in sync with gsd-executor.md specialist_registry.
 */
const VOLT_AGENTS = [
  // Language Specialists (voltagent-lang)
  { name: 'voltagent-lang:python-pro', description: 'Python development, web frameworks, data science', category: 'lang' },
  { name: 'voltagent-lang:typescript-pro', description: 'TypeScript development, React, frameworks', category: 'lang' },
  { name: 'voltagent-lang:javascript-pro', description: 'JavaScript, Node.js, Express', category: 'lang' },
  { name: 'voltagent-lang:golang-pro', description: 'Go development, concurrency', category: 'lang' },
  { name: 'voltagent-lang:rust-engineer', description: 'Rust development, systems programming', category: 'lang' },
  { name: 'voltagent-lang:java-architect', description: 'Java, Spring, enterprise', category: 'lang' },
  { name: 'voltagent-lang:csharp-developer', description: 'C#, .NET, ASP.NET', category: 'lang' },
  { name: 'voltagent-lang:rails-expert', description: 'Ruby, Rails', category: 'lang' },
  { name: 'voltagent-lang:php-pro', description: 'PHP, Laravel, Symfony', category: 'lang' },
  { name: 'voltagent-lang:swift-expert', description: 'Swift, iOS, macOS development', category: 'lang' },
  { name: 'voltagent-lang:react-specialist', description: 'React development', category: 'lang' },
  { name: 'voltagent-lang:vue-expert', description: 'Vue.js development', category: 'lang' },
  { name: 'voltagent-lang:angular-architect', description: 'Angular development', category: 'lang' },
  { name: 'voltagent-lang:nextjs-developer', description: 'Next.js development', category: 'lang' },
  { name: 'voltagent-lang:flutter-expert', description: 'Flutter cross-platform', category: 'lang' },
  { name: 'voltagent-lang:spring-boot-engineer', description: 'Spring Boot applications', category: 'lang' },
  { name: 'voltagent-lang:laravel-specialist', description: 'Laravel applications', category: 'lang' },

  // Infrastructure Specialists (voltagent-infra)
  { name: 'voltagent-infra:kubernetes-specialist', description: 'Kubernetes orchestration, deployments', category: 'infra' },
  { name: 'voltagent-infra:docker-expert', description: 'Docker containerization', category: 'infra' },
  { name: 'voltagent-infra:terraform-engineer', description: 'Infrastructure as code, Terraform', category: 'infra' },
  { name: 'voltagent-infra:devops-engineer', description: 'CI/CD pipelines, DevOps', category: 'infra' },
  { name: 'voltagent-infra:cloud-architect', description: 'AWS, Azure, GCP cloud architecture', category: 'infra' },
  { name: 'voltagent-infra:security-engineer', description: 'Security architecture, authentication', category: 'infra' },

  // Data & AI Specialists (voltagent-data-ai)
  { name: 'voltagent-data-ai:postgres-pro', description: 'PostgreSQL database design, optimization', category: 'data-ai' },
  { name: 'voltagent-data-ai:database-optimizer', description: 'Database performance tuning', category: 'data-ai' },
  { name: 'voltagent-data-ai:data-engineer', description: 'Data pipelines, ETL', category: 'data-ai' },
  { name: 'voltagent-data-ai:ml-engineer', description: 'ML model development', category: 'data-ai' },
  { name: 'voltagent-data-ai:nlp-engineer', description: 'Natural language processing', category: 'data-ai' },

  // QA & Security (voltagent-qa-sec)
  { name: 'voltagent-qa-sec:qa-expert', description: 'Quality assurance, testing strategy', category: 'qa-sec' },
  { name: 'voltagent-qa-sec:test-automator', description: 'Test automation', category: 'qa-sec' },
  { name: 'voltagent-qa-sec:performance-engineer', description: 'Performance testing', category: 'qa-sec' },
  { name: 'voltagent-qa-sec:penetration-tester', description: 'Security testing', category: 'qa-sec' },

  // Core Development (voltagent-core-dev)
  { name: 'voltagent-core-dev:api-designer', description: 'API design, REST, GraphQL', category: 'core-dev' },
  { name: 'voltagent-core-dev:backend-developer', description: 'Backend development', category: 'core-dev' },
  { name: 'voltagent-core-dev:fullstack-developer', description: 'Full-stack development', category: 'core-dev' },
  { name: 'voltagent-core-dev:mobile-developer', description: 'Mobile development', category: 'core-dev' },
  { name: 'voltagent-core-dev:microservices-architect', description: 'Microservices architecture', category: 'core-dev' },

  // Meta Specialists (voltagent-meta)
  { name: 'voltagent-meta:multi-agent-coordinator', description: 'Coordinating multiple specialists', category: 'meta' },
  { name: 'voltagent-meta:workflow-orchestrator', description: 'Complex workflow orchestration', category: 'meta' },
];

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

  lines.push('# Available Specialists');
  lines.push('');
  lines.push(`_Generated: ${timestamp}_`);
  lines.push('');

  // Section 1: VoltAgent Built-in Specialists (always available)
  lines.push('## VoltAgent Specialists (Built-in)');
  lines.push('');
  lines.push('These specialists are available via Claude Code Task tool. Use the full name as `specialist:` value.');
  lines.push('');

  // Group by category
  const categories = {
    'lang': { title: '### Language', agents: [] },
    'infra': { title: '### Infrastructure', agents: [] },
    'data-ai': { title: '### Data & AI', agents: [] },
    'qa-sec': { title: '### QA & Security', agents: [] },
    'core-dev': { title: '### Core Development', agents: [] },
    'meta': { title: '### Meta', agents: [] },
  };

  for (const agent of VOLT_AGENTS) {
    if (categories[agent.category]) {
      categories[agent.category].agents.push(agent);
    }
  }

  for (const [key, cat] of Object.entries(categories)) {
    if (cat.agents.length > 0) {
      lines.push(cat.title);
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
    const totalCount = VOLT_AGENTS.length + agents.length;
    console.log(`Generated: ${output_path} (${VOLT_AGENTS.length} volt + ${agents.length} custom = ${totalCount} specialists)`);
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
  VOLT_AGENTS,
  cmdEnumerateAgents,
  cmdDetermineVerificationTier,
  enumerateAgents,
  extractAgentMetadata,
  filterGsdSystemAgents,
  generateAvailableAgentsMd,
  determineVerificationTier,
};
