#!/usr/bin/env bash
# Re-mirror 10x-cli artifacts from the Copilot profile (.github/) into Claude Code (.claude/).
# Run this after every `10x get <lesson>` so Claude Code skills/commands stay in sync.
# The 10x-cli config stays on tool=copilot; this script never touches .github/.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .claude/skills
mkdir -p .claude/skills .claude/commands
cp -r .github/skills/. .claude/skills/
rm -f .claude/commands/m*l*-*.md .claude/commands/skill-explainer.md
cp .github/prompts/*.md .claude/commands/ 2>/dev/null || true

echo "Synced $(find .claude/skills -name SKILL.md | wc -l) skills and $(ls .claude/commands | wc -l) commands."
echo "Reminder: also re-copy the <!-- BEGIN @przeprogramowani/10x-cli --> block"
echo "from .github/copilot-instructions.md into CLAUDE.md if the lesson changed it."
