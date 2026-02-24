/**
 * Commands — Standalone utility commands
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { safeReadFile, loadConfig, isGitIgnored, execGit, normalizePhaseName, getArchivedPhaseDirs, generateSlugInternal, getMilestoneInfo, resolveModelInternal, MODEL_PROFILES, output, error, findPhaseInternal } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdHistoryDigest(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const digest = { phases: {}, decisions: [], tech_stack: new Set() };

  // Collect all phase directories: archived + current
  const allPhaseDirs = [];

  // Add archived phases first (oldest milestones first)
  const archived = getArchivedPhaseDirs(cwd);
  for (const a of archived) {
    allPhaseDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current phases
  if (fs.existsSync(phasesDir)) {
    try {
      const currentDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allPhaseDirs.push({ name: dir, fullPath: path.join(phasesDir, dir), milestone: null });
      }
    } catch {}
  }

  if (allPhaseDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allPhaseDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);

          const phaseNum = fm.phase || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach(a => digest.phases[phaseNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach(p => digest.phases[phaseNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach(d => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach(t => digest.tech_stack.add(typeof t === 'string' ? t : t.name));
          }

        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach(p => {
      digest.phases[p].provides = [...digest.phases[p].provides];
      digest.phases[p].affects = [...digest.phases[p].affects];
      digest.phases[p].patterns = [...digest.phases[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';

  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) {
    const result = { model: 'sonnet', profile, unknown_agent: true };
    output(result, raw, 'sonnet');
    return;
  }

  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const model = resolved === 'opus' ? 'inherit' : resolved;
  const result = { model, profile };
  output(result, raw, model);
}

function cmdCommit(cwd, message, files, raw, amend) {
  if (!message && !amend) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
  for (const file of filesToStage) {
    execGit(cwd, ['add', file]);
  }

  // Commit
  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = { committed: false, hash: null, reason: 'nothing_to_commit', error: commitResult.stderr };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const result = { committed: true, hash, reason: 'committed' };
  output(result, raw, hash || 'committed');
}

function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

async function cmdWebsearch(query, options, raw) {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!apiKey) {
    // No key = silent skip, agent falls back to built-in WebSearch
    output({ available: false, reason: 'BRAVE_API_KEY not set' }, raw, '');
    return;
  }

  if (!query) {
    output({ available: false, error: 'Query required' }, raw, '');
    return;
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.limit || 10),
    country: 'us',
    search_lang: 'en',
    text_decorations: 'false'
  });

  if (options.freshness) {
    params.set('freshness', options.freshness);
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      }
    );

    if (!response.ok) {
      output({ available: false, error: `API error: ${response.status}` }, raw, '');
      return;
    }

    const data = await response.json();

    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age || null
    }));

    output({
      available: true,
      query,
      count: results.length,
      results
    }, raw, results.map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n'));
  } catch (err) {
    output({ available: false, error: err.message }, raw, '');
  }
}

function cmdProgressRender(cwd, format, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const milestone = getMilestoneInfo(cwd);

  const phases = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch {}

  const percent = totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    out += `| Phase | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      phases,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      percent,
    }, raw);
  }
}

function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

function cmdScaffold(cwd, type, options, raw) {
  const { phase, name } = options;
  const padded = phase ? normalizePhaseName(phase) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find phase directory
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const phaseDir = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during /gsd:discuss-phase ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(phaseDir, `${padded}-UAT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(phaseDir, `${padded}-VERIFICATION.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Verification\n\n## Goal-Backward Verification\n\n**Phase Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = path.join(cwd, '.planning', 'phases');
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output({ created: true, directory: `.planning/phases/${dirName}`, path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir`);
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = path.relative(cwd, filePath);
  output({ created: true, path: relPath }, raw, relPath);
}

function cmdLogSpecialistError(cwd, options, raw) {
  const { phase, plan, task, specialist, errorType, details } = options;

  // Validate required parameters
  if (!phase || !plan || !task || !specialist || !errorType || !details) {
    error('Missing required parameters. Required: --phase, --plan, --task, --specialist, --error-type, --details');
  }

  // Create error log entry
  const timestamp = new Date().toISOString();
  const errorEntry = {
    phase,
    plan,
    task,
    specialist,
    error_type: errorType,
    details,
    timestamp,
  };

  // Ensure .planning directory exists
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) {
    error('.planning directory not found');
  }

  // Append to specialist-errors.jsonl
  const errorLogPath = path.join(planningDir, 'specialist-errors.jsonl');
  const logLine = JSON.stringify(errorEntry) + '\n';
  fs.appendFileSync(errorLogPath, logLine, 'utf-8');

  // Also log to STATE.md as a blocker for visibility
  const { cmdStateAddBlocker } = require('./state.cjs');
  const errorSummary = `[${phase}-${plan}] ${errorType}: ${specialist} failed on task ${task} - ${details}`;
  try {
    cmdStateAddBlocker(cwd, errorSummary, true); // raw=true to suppress output
  } catch (e) {
    // Non-critical if STATE.md update fails, error is still logged to JSONL
  }

  output({
    logged: true,
    file: 'specialist-errors.jsonl',
    entry: errorEntry,
  }, raw, 'logged');
}

// ─── Agent Teams Commands ──────────────────────────────────────────────────────

/**
 * Convert plan tasks to team task JSON format for agent teams
 */
function cmdPlanToTeamTasks(cwd, planPath, raw) {
  const fullPath = path.isAbsolute(planPath) ? planPath : path.join(cwd, planPath);

  if (!fs.existsSync(fullPath)) {
    error(`Plan file not found: ${planPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const { extractFrontmatter } = require('./frontmatter.cjs');
  const fm = extractFrontmatter(content);

  // Extract tasks using regex
  const taskRegex = /<task\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/task>/gi;
  const tasks = [];
  let match;
  let taskNum = 1;

  // Domain detection patterns
  const domainPatterns = {
    'python': /python|django|fastapi|pytest|\.py/i,
    'typescript': /typescript|tsx?|react|next\.?js/i,
    'golang': /golang|\.go/i,
    'rust': /rust|cargo|\.rs/i,
    'database': /postgres|mysql|sql|migration/i,
    'docker': /docker|container|compose/i,
    'kubernetes': /kubernetes|k8s|helm/i,
    'terraform': /terraform|\.tf/i,
    'security': /security|auth|oauth|jwt/i,
    'testing': /test|qa|cypress|playwright/i,
  };

  while ((match = taskRegex.exec(content)) !== null) {
    const taskName = match[1];
    const taskContent = match[2];

    // Extract action
    const actionMatch = taskContent.match(/<action>([\s\S]*?)<\/action>/i);
    const action = actionMatch ? actionMatch[1].trim() : '';

    // Extract files
    const filesMatch = taskContent.match(/<files>([\s\S]*?)<\/files>/i);
    const files = filesMatch ? filesMatch[1].trim().split('\n').map(f => f.trim()).filter(f => f) : [];

    // Extract verify
    const verifyMatch = taskContent.match(/<verify>([\s\S]*?)<\/verify>/i);
    const verify = verifyMatch ? verifyMatch[1].trim() : '';

    // Extract done
    const doneMatch = taskContent.match(/<done>([\s\S]*?)<\/done>/i);
    const done = doneMatch ? doneMatch[1].trim() : '';

    // Detect domain from task content
    let domain = 'general';
    const fullText = `${taskName} ${action} ${files.join(' ')}`;
    for (const [d, pattern] of Object.entries(domainPatterns)) {
      if (pattern.test(fullText)) {
        domain = d;
        break;
      }
    }

    const planId = fm.phase && fm.plan ? `${fm.phase}-${String(fm.plan).padStart(2, '0')}` : path.basename(planPath, '-PLAN.md');

    tasks.push({
      plan_id: planId,
      task_num: taskNum,
      name: taskName,
      description: action,
      files,
      verify,
      done,
      domain,
      depends_on: [], // Could be enhanced to parse dependencies
    });

    taskNum++;
  }

  output(tasks, raw, JSON.stringify(tasks, null, 2));
}

/**
 * Detect domain from task description and return specialist
 */
function cmdTaskDetectDomain(description, raw) {
  if (!description) {
    output({ specialist: '', domain: '', confidence: 0, keywords: [] }, raw, '');
    return;
  }

  const descLower = description.toLowerCase();

  // Specialist mappings (domain -> voltagent specialist)
  const specialistMap = {
    'python': 'voltagent-lang:python-pro',
    'typescript': 'voltagent-lang:typescript-pro',
    'javascript': 'voltagent-lang:javascript-pro',
    'golang': 'voltagent-lang:golang-pro',
    'rust': 'voltagent-lang:rust-engineer',
    'java': 'voltagent-lang:java-architect',
    'csharp': 'voltagent-lang:csharp-developer',
    'ruby': 'voltagent-lang:rails-expert',
    'php': 'voltagent-lang:php-pro',
    'swift': 'voltagent-lang:swift-expert',
    'react': 'voltagent-lang:react-specialist',
    'vue': 'voltagent-lang:vue-expert',
    'angular': 'voltagent-lang:angular-architect',
    'nextjs': 'voltagent-lang:nextjs-developer',
    'kubernetes': 'voltagent-infra:kubernetes-specialist',
    'docker': 'voltagent-infra:docker-expert',
    'terraform': 'voltagent-infra:terraform-engineer',
    'devops': 'voltagent-infra:devops-engineer',
    'security': 'voltagent-infra:security-engineer',
    'postgres': 'voltagent-data-ai:postgres-pro',
    'database': 'voltagent-data-ai:database-optimizer',
    'ml': 'voltagent-data-ai:ml-engineer',
    'testing': 'voltagent-qa-sec:qa-expert',
    'api': 'voltagent-core-dev:api-designer',
    'backend': 'voltagent-core-dev:backend-developer',
  };

  // Detection patterns with priority
  const detectionPatterns = [
    // Specific frameworks (highest priority)
    { pattern: /django|fastapi/i, domain: 'python', keywords: ['django', 'fastapi'] },
    { pattern: /next\.?js|nextjs/i, domain: 'nextjs', keywords: ['nextjs'] },
    { pattern: /react native|flutter/i, domain: 'mobile', keywords: ['react native', 'flutter'] },
    { pattern: /spring boot/i, domain: 'java', keywords: ['spring boot'] },
    { pattern: /laravel/i, domain: 'php', keywords: ['laravel'] },
    { pattern: /rails|ruby on rails/i, domain: 'ruby', keywords: ['rails'] },

    // Languages
    { pattern: /python|pytest|\.py/i, domain: 'python', keywords: ['python'] },
    { pattern: /typescript|\.tsx?/i, domain: 'typescript', keywords: ['typescript'] },
    { pattern: /golang|\.go/i, domain: 'golang', keywords: ['golang'] },
    { pattern: /rust|cargo|\.rs/i, domain: 'rust', keywords: ['rust'] },
    { pattern: /java|maven|gradle/i, domain: 'java', keywords: ['java'] },
    { pattern: /c#|csharp|\.net/i, domain: 'csharp', keywords: ['csharp'] },
    { pattern: /javascript|node\.?js/i, domain: 'javascript', keywords: ['javascript'] },
    { pattern: /php|composer/i, domain: 'php', keywords: ['php'] },
    { pattern: /swift|ios|swiftui/i, domain: 'swift', keywords: ['swift'] },

    // Infrastructure
    { pattern: /kubernetes|k8s|helm/i, domain: 'kubernetes', keywords: ['kubernetes'] },
    { pattern: /docker|container|compose/i, domain: 'docker', keywords: ['docker'] },
    { pattern: /terraform|\.tf/i, domain: 'terraform', keywords: ['terraform'] },
    { pattern: /ci\/cd|pipeline|github actions/i, domain: 'devops', keywords: ['cicd'] },

    // Data
    { pattern: /postgres(ql)?|psql/i, domain: 'postgres', keywords: ['postgres'] },
    { pattern: /mysql|database|migration/i, domain: 'database', keywords: ['database'] },
    { pattern: /machine learning|ml model/i, domain: 'ml', keywords: ['ml'] },

    // Security
    { pattern: /security|auth|oauth|jwt/i, domain: 'security', keywords: ['security'] },

    // Frontend
    { pattern: /react|jsx|hooks/i, domain: 'react', keywords: ['react'] },
    { pattern: /vue|vuex|nuxt/i, domain: 'vue', keywords: ['vue'] },
    { pattern: /angular|rxjs/i, domain: 'angular', keywords: ['angular'] },

    // Testing
    { pattern: /testing|test|qa/i, domain: 'testing', keywords: ['testing'] },

    // Backend
    { pattern: /api|rest|graphql/i, domain: 'api', keywords: ['api'] },
    { pattern: /backend|server/i, domain: 'backend', keywords: ['backend'] },
  ];

  let detectedDomain = '';
  let matchedKeywords = [];
  let confidence = 0;

  for (const { pattern, domain, keywords } of detectionPatterns) {
    if (pattern.test(descLower)) {
      detectedDomain = domain;
      matchedKeywords = keywords;
      confidence = 0.85;
      break;
    }
  }

  const specialist = specialistMap[detectedDomain] || '';

  output({
    specialist,
    domain: detectedDomain,
    confidence,
    keywords: matchedKeywords,
  }, raw, specialist);
}

/**
 * Aggregate team results into SUMMARY.md format
 * Note: This creates a placeholder - actual team task data comes from Claude's team tools
 */
function cmdTeamAggregateResults(cwd, options, raw) {
  const { team, plan, output: outputPath } = options;

  if (!team || !plan || !outputPath) {
    error('Missing required parameters: --team, --plan, --output');
  }

  const today = new Date().toISOString().split('T')[0];
  const fullOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(cwd, outputPath);

  // Create SUMMARY.md template that will be populated by orchestrator
  const summaryTemplate = `---
plan: "${plan}"
team: "${team}"
created: ${today}
status: pending_aggregation
execution_mode: team
---

# Plan ${plan} — Execution Summary (Team Mode)

## Team Execution

**Team Name:** ${team}
**Execution Mode:** Agent Teams

## Task Results

<!-- TEAM_RESULTS_PLACEHOLDER - Orchestrator populates this from TaskList -->

| Task | Specialist | Status | Duration | Commit |
|------|-----------|--------|----------|--------|

## Files Modified

<!-- TEAM_FILES_PLACEHOLDER - Aggregated from task results -->

## Commits

<!-- TEAM_COMMITS_PLACEHOLDER - Collected commit hashes -->

## Deviations

<!-- TEAM_DEVIATIONS_PLACEHOLDER -->

## Next Steps

_Pending aggregation from team task list_
`;

  // Ensure output directory exists
  const outputDir = path.dirname(fullOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(fullOutputPath, summaryTemplate, 'utf-8');

  output({
    created: true,
    path: fullOutputPath,
    team,
    plan,
    note: 'Template created - orchestrator populates from TeamList results',
  }, raw, fullOutputPath);
}

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdVerifyPathExists,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdCommit,
  cmdSummaryExtract,
  cmdWebsearch,
  cmdProgressRender,
  cmdTodoComplete,
  cmdScaffold,
  cmdLogSpecialistError,
  cmdPlanToTeamTasks,
  cmdTaskDetectDomain,
  cmdTeamAggregateResults,
};
