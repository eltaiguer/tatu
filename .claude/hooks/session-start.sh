#!/bin/bash
# Injects the using-agent-skills meta-skill (skill discovery flowchart) as
# additionalContext at the start of every session in this repo.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
META_SKILL="$SCRIPT_DIR/../skills/using-agent-skills/SKILL.md"

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

if [ ! -f "$META_SKILL" ]; then
  exit 0
fi

CONTENT=$(cat "$META_SKILL")
jq -n --arg content "$CONTENT" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $content}}'
