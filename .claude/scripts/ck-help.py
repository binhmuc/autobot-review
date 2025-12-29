#!/usr/bin/env python3
"""
ClaudeKit Help Command - All-in-one guide with dynamic command discovery.
Scans .claude/commands/ directory to build catalog at runtime.

Usage:
    python ck-help.py                    # Overview with quick start
    python ck-help.py fix                # Category guide with workflow
    python ck-help.py plan:fast          # Command details
    python ck-help.py debug login error  # Task recommendations
    python ck-help.py auth               # Search (unknown word)
"""

import sys
import re
import io
from pathlib import Path

# Fix Windows console encoding for Unicode characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


# Output type markers for LLM presentation guidance
# Format: @CK_OUTPUT_TYPE:<type>
# Types:
#   - comprehensive-docs: Full documentation, show verbatim + add context
#   - category-guide: Workflow guide, show full + explain workflow
#   - command-details: Single command, show + offer to run
#   - search-results: Search matches, show + offer alternatives
#   - task-recommendations: Task-based suggestions, explain reasoning
OUTPUT_TYPES = {
    "comprehensive-docs": "Show FULL output verbatim, then ADD helpful context, examples, and real-world tips",
    "category-guide": "Show complete workflow, then ENHANCE with practical usage scenarios",
    "command-details": "Show command info, then ADD usage examples and related commands",
    "search-results": "Show all matches, then HELP user narrow down or explore",
    "task-recommendations": "Show recommendations, then EXPLAIN why these fit and offer to start",
}


def emit_output_type(output_type: str) -> None:
    """Emit output type marker for LLM presentation guidance."""
    print(f"@CK_OUTPUT_TYPE:{output_type}")
    print()


# Task keyword mappings for intent detection
TASK_MAPPINGS = {
    "fix": ["fix", "bug", "error", "broken", "issue", "debug", "crash", "fail", "wrong", "not working"],
    "plan": ["plan", "design", "architect", "research", "think", "analyze", "strategy", "how to", "approach"],
    "cook": ["implement", "build", "create", "add", "feature", "code", "develop", "make", "write"],
    "bootstrap": ["start", "new", "init", "setup", "project", "scaffold", "generate", "begin"],
    "test": ["test", "check", "verify", "validate", "spec", "unit", "integration", "coverage"],
    "docs": ["document", "readme", "docs", "explain", "comment", "documentation"],
    "git": ["commit", "push", "pr", "merge", "branch", "pull", "request", "git"],
    "design": ["ui", "ux", "style", "layout", "visual", "css", "component", "page", "responsive"],
    "review": ["review", "audit", "inspect", "quality", "refactor", "clean"],
    "content": ["copy", "text", "marketing", "content", "blog", "seo"],
    "integrate": ["integrate", "payment", "api", "connect", "webhook", "third-party"],
    "skill": ["skill", "agent", "automate", "workflow"],
    "scout": ["find", "search", "locate", "explore", "scan", "where"],
    "config": ["config", "configure", "settings", "ck.json", ".ck.json", "setup", "locale", "language", "paths"],
    "coding-level": ["coding", "level", "eli5", "junior", "senior", "lead", "god", "beginner", "expert", "teach", "learn", "explain"],
}

# Category workflows and tips
CATEGORY_GUIDES = {
    "fix": {
        "title": "Fixing Issues",
        "workflow": [
            ("Start", "`/fix` \"describe your issue\""),
            ("If stuck", "`/debug` \"more details\""),
            ("Verify", "`/test`"),
        ],
        "tip": "Include error messages for better results",
    },
    "plan": {
        "title": "Planning",
        "workflow": [
            ("Quick plan", "`/plan:fast` \"your task\""),
            ("Deep research", "`/plan:hard` \"complex task\""),
            ("Validate", "`/plan:validate` (interview to confirm decisions)"),
            ("Execute plan", "`/code` (runs the plan)"),
        ],
        "tip": "Use /plan:validate to confirm assumptions before coding",
    },
    "cook": {
        "title": "Implementation",
        "workflow": [
            ("Quick impl", "`/cook` \"your feature\""),
            ("Auto mode", "`/cook:auto` \"trust me bro\""),
            ("Test", "`/test`"),
        ],
        "tip": "Cook is standalone - it plans internally. Use /plan → /code for explicit planning",
    },
    "bootstrap": {
        "title": "Project Setup",
        "workflow": [
            ("Quick start", "`/bootstrap:auto:fast` \"requirements\""),
            ("Full setup", "`/bootstrap` \"detailed requirements\""),
        ],
        "tip": "Include tech stack preferences in description",
    },
    "test": {
        "title": "Testing",
        "workflow": [
            ("Run tests", "`/test`"),
            ("Fix failures", "`/fix:test`"),
        ],
        "tip": "Run tests frequently during development",
    },
    "docs": {
        "title": "Documentation",
        "workflow": [
            ("Initialize", "`/docs:init`"),
            ("Update", "`/docs:update`"),
        ],
        "tip": "Keep docs close to code for accuracy",
    },
    "git": {
        "title": "Git Workflow",
        "workflow": [
            ("Commit", "`/git:cm`"),
            ("Push", "`/git:cp`"),
            ("PR", "`/git:pr`"),
        ],
        "tip": "Commit often with clear messages",
    },
    "design": {
        "title": "Design",
        "workflow": [
            ("Quick design", "`/design:fast` \"description\""),
            ("From screenshot", "`/design:screenshot` <path>"),
            ("3D design", "`/design:3d` \"description\""),
        ],
        "tip": "Reference existing designs for consistency",
    },
    "review": {
        "title": "Code Review",
        "workflow": [
            ("Full review", "`/review:codebase`"),
        ],
        "tip": "Review before merging to main",
    },
    "content": {
        "title": "Content Creation",
        "workflow": [
            ("Quick copy", "`/content:fast` \"requirements\""),
            ("Quality copy", "`/content:good` \"requirements\""),
            ("Optimize", "`/content:cro`"),
        ],
        "tip": "Know your audience before writing",
    },
    "integrate": {
        "title": "Integration",
        "workflow": [
            ("Polar.sh", "`/integrate:polar`"),
            ("SePay", "`/integrate:sepay`"),
        ],
        "tip": "Read API docs before integrating",
    },
    "skill": {
        "title": "Skill Management",
        "workflow": [
            ("Create", "`/skill:create`"),
            ("Optimize", "`/skill:optimize`"),
        ],
        "tip": "Skills extend agent capabilities",
    },
    "scout": {
        "title": "Codebase Exploration",
        "workflow": [
            ("Find files", "`/scout` \"what to find\""),
            ("External tools", "`/scout:ext` \"query\""),
        ],
        "tip": "Be specific about what you're looking for",
    },
    "coding-level": {
        "title": "Coding Level (Adaptive Communication)",
        "workflow": [
            ("Disabled", "`codingLevel: -1` (default, no injection)"),
            ("ELI5", "`codingLevel: 0` (analogies, baby steps)"),
            ("Junior", "`codingLevel: 1` (WHY before HOW)"),
            ("Mid-Level", "`codingLevel: 2` (patterns, trade-offs)"),
            ("Senior", "`codingLevel: 3` (production code, ops)"),
            ("Tech Lead", "`codingLevel: 4` (risk matrix, strategy)"),
            ("God Mode", "`codingLevel: 5` (code first, no fluff)"),
        ],
        "tip": "Set in .ck.json. Guidelines auto-inject on session start",
    },
    "config": {
        "title": "ClaudeKit Configuration (.ck.json)",
        "workflow": [
            ("Global", "Set user prefs in `~/.claude/.ck.json`"),
            ("Local", "Override per-project in `./.claude/.ck.json`"),
            ("Resolution", "DEFAULT → global → local (deep merge)"),
        ],
        "tip": "Global config works in fresh dirs; local overrides for projects",
    },
}


def detect_prefix(commands_dir: Path) -> str:
    """Detect if commands use /ck: prefix based on directory structure."""
    ck_commands_dir = commands_dir / "ck"
    return "ck:" if ck_commands_dir.exists() and ck_commands_dir.is_dir() else ""


def parse_frontmatter(file_path: Path) -> dict:
    """Parse YAML frontmatter from a markdown file."""
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception:
        return {}

    # Check for frontmatter
    if not content.startswith('---'):
        return {}

    # Find closing ---
    end_idx = content.find('---', 3)
    if end_idx == -1:
        return {}

    frontmatter = content[3:end_idx].strip()
    result = {}

    for line in frontmatter.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            result[key.strip()] = value.strip()

    return result


def discover_commands(commands_dir: Path, prefix: str) -> dict:
    """Scan .claude/commands/ and build command catalog."""
    commands = {}
    categories = {}

    if not commands_dir.exists():
        return {"commands": commands, "categories": categories}

    # Scan all .md files
    for md_file in commands_dir.rglob("*.md"):
        # Skip non-command files
        rel_path = md_file.relative_to(commands_dir)
        parts = rel_path.parts

        # Get command name from path
        # e.g., fix/fast.md -> fix:fast, plan.md -> plan
        if len(parts) == 1:
            # Root command: plan.md -> plan
            cmd_name = parts[0].replace('.md', '')
            category = "core"
        else:
            # Nested command: fix/fast.md -> fix:fast
            category = parts[0]
            cmd_name = ':'.join([p.replace('.md', '') for p in parts])

        # Parse frontmatter
        fm = parse_frontmatter(md_file)
        description = fm.get('description', '')

        # Skip if no description (not a real command)
        if not description:
            continue

        # Clean description (remove emoji indicators)
        clean_desc = re.sub(r'^[^\w\s]+\s*', '', description).strip()

        # Format command name with prefix
        formatted_name = f"/{prefix}{cmd_name}" if prefix else f"/{cmd_name}"

        # Add to commands
        if category not in commands:
            commands[category] = []

        commands[category].append({
            "name": formatted_name,
            "description": clean_desc,
            "category": category,
        })

        # Track categories
        if category not in categories:
            categories[category] = category.title()

    # Sort commands within each category
    for cat in commands:
        commands[cat].sort(key=lambda x: x["name"])

    return {"commands": commands, "categories": categories}


def detect_intent(input_str: str, categories: list) -> str:
    """Smart auto-detection of user intent."""
    if not input_str:
        return "overview"

    input_lower = input_str.lower()

    # Check if it's a known category
    if input_lower in [c.lower() for c in categories]:
        return "category"

    # Check if it looks like a command (has colon)
    if ':' in input_str:
        return "command"

    # Multiple words = task description
    if len(input_str.split()) >= 2:
        return "task"

    return "search"


def show_overview(data: dict, prefix: str) -> None:
    """Display overview with quick start guide."""
    emit_output_type("category-guide")

    commands = data["commands"]
    categories = data["categories"]
    total = sum(len(cmds) for cmds in commands.values())
    help_cmd = f"/{prefix}ck-help" if prefix else "/ck-help"

    print("# ClaudeKit Commands")
    print()
    print(f"{total} commands across {len(categories)} categories.")
    print()
    print("**Quick Start:**")
    print(f"- `/{prefix}cook` - Implement features (standalone)")
    print(f"- `/{prefix}plan` + `/{prefix}code` - Plan then execute")
    print(f"- `/{prefix}fix` - Fix bugs intelligently")
    print(f"- `/{prefix}test` - Run and analyze tests")
    print()
    print("**Categories:**")
    for cat_key in sorted(categories.keys()):
        count = len(commands.get(cat_key, []))
        print(f"- `{cat_key}` ({count})")
    print()
    print("**Usage:**")
    print(f"- `{help_cmd} <category>` - Category guide with workflow")
    print(f"- `{help_cmd} <command>` - Command details")
    print(f"- `{help_cmd} <task description>` - Recommendations")


def show_category_guide(data: dict, category: str, prefix: str) -> None:
    """Display category guide with workflow and tips."""
    emit_output_type("category-guide")

    categories = data["categories"]
    commands = data["commands"]

    # Find matching category (case-insensitive)
    cat_key = None
    for key in categories:
        if key.lower() == category.lower():
            cat_key = key
            break

    if not cat_key:
        print(f"Category '{category}' not found.")
        print()
        print("Available: " + ", ".join(f"`{c}`" for c in sorted(categories.keys())))
        return

    cmds = commands.get(cat_key, [])
    guide = CATEGORY_GUIDES.get(cat_key, {})

    print(f"# {guide.get('title', cat_key.title())}")
    print()

    # Workflow first (most important)
    if "workflow" in guide:
        print("**Workflow:**")
        for step, cmd in guide["workflow"]:
            print(f"- {step}: {cmd}")
        print()

    # Commands list
    print("**Commands:**")
    for cmd in cmds:
        print(f"- `{cmd['name']}` - {cmd['description']}")

    # Tip at the end
    if "tip" in guide:
        print()
        print(f"*Tip: {guide['tip']}*")


def show_command(data: dict, command: str, prefix: str) -> None:
    """Display command details."""
    emit_output_type("command-details")

    commands = data["commands"]

    # Normalize search term
    search = command.lower().replace("/ck:", "").replace("/", "").replace(":", "")

    found = None
    for cmds in commands.values():
        for cmd in cmds:
            # Normalize command name for comparison
            name = cmd["name"].lower().replace("/ck:", "").replace("/", "").replace(":", "")
            if name == search:
                found = cmd
                break
        if found:
            break

    if not found:
        print(f"Command '{command}' not found.")
        print()
        do_search(data, command.replace(":", " "), prefix)
        return

    print(f"# `{found['name']}`")
    print()
    print(found['description'])
    print()
    print(f"**Category:** {found['category']}")
    print()
    print(f"**Usage:** `{found['name']} <your-input>`")

    # Show related commands (same category)
    cat = found['category']
    if cat in commands:
        related = [c for c in commands[cat] if c['name'] != found['name']][:3]
        if related:
            related_names = ", ".join(f"`{r['name']}`" for r in related)
            print()
            print(f"**Related:** {related_names}")


def do_search(data: dict, term: str, prefix: str) -> None:
    """Search commands by keyword."""
    emit_output_type("search-results")

    commands = data["commands"]
    term_lower = term.lower()
    matches = []

    for cmds in commands.values():
        for cmd in cmds:
            if term_lower in cmd["name"].lower() or term_lower in cmd["description"].lower():
                matches.append(cmd)

    if not matches:
        print(f"No commands found for '{term}'.")
        print()
        print("Try browsing categories: " + ", ".join(f"`{c}`" for c in sorted(data["categories"].keys())))
        return

    print(f"# Search: {term}")
    print()
    print(f"Found {len(matches)} matches:")
    for cmd in matches[:8]:
        print(f"- `{cmd['name']}` - {cmd['description']}")


def recommend_task(data: dict, task: str, prefix: str) -> None:
    """Recommend commands for a task description."""
    emit_output_type("task-recommendations")

    commands = data["commands"]
    task_lower = task.lower()

    # Score categories by keyword matches
    scores = {}
    for cat, keywords in TASK_MAPPINGS.items():
        score = sum(1 for kw in keywords if kw in task_lower)
        if score > 0:
            scores[cat] = score

    if not scores:
        print(f"Not sure about: {task}")
        print()
        print("Try being more specific, or browse categories: " + ", ".join(f"`{c}`" for c in sorted(data["categories"].keys())))
        return

    sorted_cats = sorted(scores.items(), key=lambda x: -x[1])
    top_cat = sorted_cats[0][0]
    guide = CATEGORY_GUIDES.get(top_cat, {})

    print(f"# Recommended for: {task}")
    print()

    # Show workflow first (most actionable)
    if "workflow" in guide:
        print("**Workflow:**")
        for step, cmd in guide["workflow"][:3]:
            print(f"- {step}: {cmd}")
        print()

    # Show relevant commands
    print("**Commands:**")
    shown = 0
    for cat, _ in sorted_cats[:2]:
        if cat in commands:
            for cmd in commands[cat][:2]:
                print(f"- `{cmd['name']}` - {cmd['description']}")
                shown += 1
                if shown >= 4:
                    break
        if shown >= 4:
            break

    if "tip" in guide:
        print()
        print(f"*Tip: {guide['tip']}*")


def show_config_guide() -> None:
    """Display comprehensive .ck.json configuration guide."""
    emit_output_type("comprehensive-docs")

    print("# ClaudeKit Configuration (.ck.json)")
    print()
    print("**Locations (cascading resolution):**")
    print("- Global: `~/.claude/.ck.json` (user preferences)")
    print("- Local: `./.claude/.ck.json` (project overrides)")
    print()
    print("**Resolution Order:** `DEFAULT → global → local`")
    print("- Global config sets user defaults")
    print("- Local config overrides for specific projects")
    print("- Deep merge: nested objects merge recursively")
    print()
    print("**Purpose:** Customize plan naming, paths, locale, and hook behavior.")
    print()
    print("---")
    print()
    print("## Quick Start")
    print()
    print("**Global config** (`~/.claude/.ck.json`) - your preferences:")
    print("```json")
    print('{')
    print('  "locale": {')
    print('    "thinkingLanguage": "en",')
    print('    "responseLanguage": "vi"')
    print('  },')
    print('  "plan": { "issuePrefix": "GH-" }')
    print('}')
    print("```")
    print()
    print("**Local override** (`./.claude/.ck.json`) - project-specific:")
    print("```json")
    print('{')
    print('  "plan": { "issuePrefix": "JIRA-" },')
    print('  "paths": { "docs": "documentation" }')
    print('}')
    print("```")
    print()
    print("---")
    print()
    print("## Full Schema")
    print()
    print("```json")
    print('{')
    print('  "plan": {')
    print('    "namingFormat": "{date}-{issue}-{slug}",  // Plan folder naming')
    print('    "dateFormat": "YYMMDD-HHmm",              // Date format in names')
    print('    "issuePrefix": "GH-",                     // Issue ID prefix (null = #)')
    print('    "reportsDir": "reports",                  // Reports subfolder')
    print('    "resolution": {')
    print('      "order": ["session", "branch"],  // Resolution chain')
    print('      "branchPattern": "(?:feat|fix|...)/.+"  // Branch slug regex')
    print('    },')
    print('    "validation": {')
    print('      "mode": "prompt",       // "auto" | "prompt" | "off"')
    print('      "minQuestions": 3,      // Min questions to ask')
    print('      "maxQuestions": 8,      // Max questions to ask')
    print('      "focusAreas": ["assumptions", "risks", "tradeoffs", "architecture"]')
    print('    }')
    print('  },')
    print('  "paths": {')
    print('    "docs": "docs",     // Documentation directory')
    print('    "plans": "plans"    // Plans directory')
    print('  },')
    print('  "locale": {')
    print('    "thinkingLanguage": null, // Language for reasoning ("en" recommended)')
    print('    "responseLanguage": null  // Language for output ("vi", "fr", etc.)')
    print('  },')
    print('  "trust": {')
    print('    "passphrase": null,   // Secret for testing context injection')
    print('    "enabled": false      // Enable trust verification')
    print('  },')
    print('  "project": {')
    print('    "type": "auto",           // "monorepo", "single-repo", "auto"')
    print('    "packageManager": "auto", // "npm", "pnpm", "yarn", "auto"')
    print('    "framework": "auto"       // "next", "react", "vue", "auto"')
    print('  },')
    print('  "codingLevel": -1  // Adaptive communication (-1 to 5)')
    print('}')
    print("```")
    print()
    print("---")
    print()
    print("## Key Concepts")
    print()
    print("**Plan Resolution Chain:**")
    print("1. `session` - Check session temp file for active plan")
    print("2. `branch` - Match git branch slug to plan folder")
    print()
    print("**Naming Format Variables:**")
    print("- `{date}` - Formatted date (per dateFormat)")
    print("- `{issue}` - Issue ID with prefix")
    print("- `{slug}` - Descriptive slug from branch or input")
    print()
    print("**Language Settings:**")
    print("- `thinkingLanguage` - Language for internal reasoning (\"en\" recommended)")
    print("- `responseLanguage` - Language for user-facing output (\"vi\", \"fr\", etc.)")
    print()
    print("When both are set, Claude thinks in one language but responds in another.")
    print("This improves precision (English) while maintaining natural output (your language).")
    print()
    print("**Plan Validation:**")
    print("- `mode: \"prompt\"` - Ask user after plan creation (default)")
    print("- `mode: \"auto\"` - Always run validation interview")
    print("- `mode: \"off\"` - Skip; user runs `/plan:validate` manually")
    print()
    print("Validation interviews the user with critical questions to confirm")
    print("assumptions, risks, and architectural decisions before implementation.")
    print()
    print("**Coding Level (Adaptive Communication):**")
    print("- `-1` = Disabled (default) - no injection, saves tokens")
    print("- `0` = ELI5 - analogies, baby steps, check-ins")
    print("- `1` = Junior - WHY before HOW, pitfalls, takeaways")
    print("- `2` = Mid-Level - patterns, trade-offs, scalability")
    print("- `3` = Senior - trade-offs table, production code, ops")
    print("- `4` = Tech Lead - executive summary, risk matrix, business impact")
    print("- `5` = God Mode - code first, minimal prose, no hand-holding")
    print()
    print("Guidelines auto-inject on session start. Commands like `/brainstorm` respect them.")
    print()
    print("---")
    print()
    print("## Edge Cases & Validation")
    print()
    print("**Path Handling:**")
    print("- Trailing slashes normalized (`plans/` → `plans`)")
    print("- Empty/whitespace-only paths fall back to defaults")
    print("- Absolute paths supported (e.g., `/home/user/all-plans`)")
    print("- Path traversal (`../`) blocked for relative paths")
    print("- Null bytes and control chars rejected")
    print()
    print("**Slug Sanitization:**")
    print("- Invalid filename chars removed: `< > : \" / \\ | ? *`")
    print("- Non-alphanumeric replaced with hyphen")
    print("- Multiple hyphens collapsed: `foo---bar` → `foo-bar`")
    print("- Leading/trailing hyphens removed")
    print("- Max 100 chars to prevent filesystem issues")
    print()
    print("**Naming Pattern Validation:**")
    print("- Pattern must contain `{slug}` placeholder")
    print("- Result must be non-empty after variable substitution")
    print("- Unresolved placeholders (except `{slug}`) trigger error")
    print("- Malformed JSON config falls back to defaults")
    print()
    print("**Consolidated Plans (advanced):**")
    print("```json")
    print('{')
    print('  "paths": {')
    print('    "plans": "/home/user/all-my-plans"')
    print('  }')
    print('}')
    print("```")
    print("Absolute paths allow storing all plans in one location across projects.")
    print()
    print("---")
    print()
    print("## Examples")
    print()
    print("**Global install user (fresh directories work):**")
    print("```bash")
    print("# ~/.claude/.ck.json - applies everywhere")
    print("cd /tmp/new-project && claude  # Uses global config")
    print("```")
    print()
    print("**Project with local override:**")
    print("```bash")
    print("# Global: issuePrefix = \"GH-\"")
    print("# Local (.claude/.ck.json): issuePrefix = \"JIRA-\"")
    print("# Result: issuePrefix = \"JIRA-\" (local wins)")
    print("```")
    print()
    print("**Deep merge behavior:**")
    print("```")
    print("Global: { plan: { issuePrefix: \"GH-\", dateFormat: \"YYMMDD\" } }")
    print("Local:  { plan: { issuePrefix: \"JIRA-\" } }")
    print("Result: { plan: { issuePrefix: \"JIRA-\", dateFormat: \"YYMMDD\" } }")
    print("```")
    print()
    print("*Tip: Config is optional - all fields have sensible defaults.*")


def show_coding_level_guide() -> None:
    """Display comprehensive codingLevel configuration guide."""
    emit_output_type("comprehensive-docs")

    print("# Coding Level (Adaptive Communication)")
    print()
    print("Adjusts Claude's communication style based on user's experience level.")
    print("Guidelines auto-inject on SessionStart. Commands respect them.")
    print()
    print("---")
    print()
    print("## Levels")
    print()
    print("| Level | Name | Description |")
    print("|-------|------|-------------|")
    print("| **-1** | **Disabled** | Default - no injection, saves tokens |")
    print("| 0 | ELI5 | Zero experience - analogies, baby steps, check-ins |")
    print("| 1 | Junior | 0-2 years - WHY before HOW, pitfalls, takeaways |")
    print("| 2 | Mid-Level | 3-5 years - patterns, trade-offs, scalability |")
    print("| 3 | Senior | 5-8 years - trade-offs table, production code, ops |")
    print("| 4 | Tech Lead | 8-15 years - executive summary, risk matrix, strategy |")
    print("| 5 | God Mode | 15+ years - code first, minimal prose, no fluff |")
    print()
    print("---")
    print()
    print("## Configuration")
    print()
    print("**Set in `.ck.json`:**")
    print("```json")
    print('{')
    print('  "codingLevel": 0')
    print('}')
    print("```")
    print()
    print("**Location (cascading):**")
    print("- Global: `~/.claude/.ck.json` - personal preference")
    print("- Local: `./.claude/.ck.json` - project override")
    print()
    print("---")
    print()
    print("## How It Works")
    print()
    print("1. SessionStart hook reads `codingLevel` from `.ck.json`")
    print("2. If 0-5, injects guidelines from `.claude/output-styles/coding-level-*.md`")
    print("3. Commands like `/brainstorm` follow the injected guidelines")
    print()
    print("**Token Efficiency:**")
    print("- `-1` (default): Zero injection, zero overhead")
    print("- `0-5`: Only selected level's guidelines injected (not all)")
    print()
    print("---")
    print()
    print("## Level Details")
    print()
    print("### Level 0 (ELI5)")
    print("- **MUST** use real-world analogies (labeled boxes, recipes)")
    print("- **MUST** define every technical term")
    print("- **MUST** use \"we\" language")
    print("- **MUST** end with check-in: \"Does this make sense?\"")
    print("- **MUST** comment every line of code")
    print("- Structure: Big Picture → Analogy → Baby Steps → Try It → Check-In")
    print()
    print("### Level 1 (Junior)")
    print("- Explain WHY before HOW")
    print("- Define technical terms on first use")
    print("- Include common pitfalls section")
    print("- Add Key Takeaways and Learn More links")
    print("- Structure: Context → Approach → Implementation → Pitfalls → Takeaways")
    print()
    print("### Level 2 (Mid-Level)")
    print("- Discuss design patterns and when to use them")
    print("- Highlight trade-offs explicitly")
    print("- Consider scalability implications")
    print("- Reference patterns by name")
    print("- Structure: Approach → Design → Implementation → Edge Cases")
    print()
    print("### Level 3 (Senior)")
    print("- Lead with trade-offs table")
    print("- Show production-ready code")
    print("- Discuss operational concerns (monitoring, logging)")
    print("- Flag security implications")
    print("- **NEVER** explain basic concepts")
    print("- Structure: Trade-offs → Implementation → Ops → Security")
    print()
    print("### Level 4 (Tech Lead)")
    print("- Executive summary first (3-4 sentences)")
    print("- Risk assessment matrix (Likelihood × Impact)")
    print("- Strategic options comparison")
    print("- Business impact analysis")
    print("- Identify decisions needing stakeholder alignment")
    print("- Structure: Summary → Risks → Options → Approach → Business Impact")
    print()
    print("### Level 5 (God Mode)")
    print("- Answer exactly what was asked, nothing more")
    print("- Code first, minimal prose")
    print("- No explanations unless asked")
    print("- **NEVER** use filler phrases")
    print("- Trust their judgment completely")
    print()
    print("---")
    print()
    print("## Customization")
    print()
    print("Guidelines live in `.claude/output-styles/coding-level-*.md`")
    print("Edit these files directly to customize behavior per level.")
    print()
    print("*Tip: Use `-1` (disabled) unless you're teaching or want guided explanations.*")


def main():
    # Find .claude/commands directory
    script_path = Path(__file__).resolve()
    claude_dir = script_path.parent.parent  # .claude/scripts -> .claude
    commands_dir = claude_dir / "commands"

    if not commands_dir.exists():
        print("Error: .claude/commands/ directory not found.")
        sys.exit(1)

    # Detect prefix and discover commands
    prefix = detect_prefix(commands_dir)
    data = discover_commands(commands_dir, prefix)

    if not data["commands"]:
        print("No commands found in .claude/commands/")
        sys.exit(1)

    # Parse input
    args = sys.argv[1:]
    input_str = " ".join(args).strip()

    # Special case: config documentation (not a command category)
    if input_str.lower() in ["config", "configuration", ".ck.json", "ck.json"]:
        show_config_guide()
        return

    # Special case: coding level documentation
    if input_str.lower() in ["coding-level", "codinglevel", "coding level", "level", "eli5", "god mode"]:
        show_coding_level_guide()
        return

    # Detect intent and route
    intent = detect_intent(input_str, list(data["categories"].keys()))

    if intent == "overview":
        show_overview(data, prefix)
    elif intent == "category":
        show_category_guide(data, input_str, prefix)
    elif intent == "command":
        show_command(data, input_str, prefix)
    elif intent == "task":
        recommend_task(data, input_str, prefix)
    else:
        do_search(data, input_str, prefix)


if __name__ == "__main__":
    main()
