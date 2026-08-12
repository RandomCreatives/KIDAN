---
description: Verify the current task and update the durable agent handoff
agent: build
---

Read `AGENTS.md` and `docs/HANDOFF.md`. Inspect `git status` and `git diff`. Run the narrow checks relevant to the change, then `npm run check` when dependencies are available. Update `docs/HANDOFF.md` with:

- what changed,
- verification performed and its result,
- decisions or assumptions introduced,
- security/privacy implications,
- the next smallest actionable tasks.

Do not include secrets, personal data, raw Telegram init data, or provider credentials in the handoff.
