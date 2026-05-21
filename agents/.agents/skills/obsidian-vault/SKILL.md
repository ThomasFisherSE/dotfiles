---
name: obsidian-vault
description: Work with the user's Obsidian vault structure and note conventions, especially VirtFolder hierarchy, wiki links, frontmatter, daily notes, templates, and durable session notes. Use when the user asks about their Obsidian vault, notes, daily notes, backlinks, note hierarchy/organization, or wants information saved into Obsidian.
---

# Obsidian Vault

## Core model

This vault is organized primarily through links and metadata, not filesystem folders.

- Preserve Obsidian wiki links like `[[Note Name]]` and `[[Note Name#Heading|Alias]]`.
- Prefer creating/updating normal Markdown notes at the vault root unless an existing convention says otherwise.
- Treat `.obsidian/` as app/plugin configuration; do not inspect or edit it unless explicitly asked.
- Avoid broad reorganizations, note renames, or bulk edits unless the user explicitly approves them.

## VirtFolder hierarchy

The vault uses the VirtFolder plugin to represent hierarchy via frontmatter, especially the `folders` field.

VirtFolder lets a note appear under one or more parent notes without being constrained by the filesystem. A note can therefore be a child of several notes at once.

Use this pattern when creating or updating notes:

```yaml
---
tags:
  - example-tag
created: YYYY-MM-DD
folders:
  - "[[Parent Note]]"
  - "[[Another Parent]]"
---
```

Some existing notes may use inline YAML for a single parent; preserve the existing style when editing a note. For new notes, prefer the list form.

When deciding parents:

- Use existing topic/index notes as parents, not physical folders.
- Multiple parents are allowed when a note naturally belongs to multiple areas.
- Do not invent a parent note unless it is clearly useful or the user asks for one.
- If unsure, ask which VirtFolder parent(s) the note should live under.

## Note creation/update conventions

When writing notes:

- Preserve existing frontmatter fields, tags, `created`, and `folders` unless the task requires changing them.
- Add or maintain `created: YYYY-MM-DD` for new durable notes when appropriate.
- Use concise title-case note names with spaces, matching the vault's existing style.
- Prefer linking to existing notes over duplicating context.
- If saving session notes or durable summaries, follow the vault's existing session-note naming conventions when applicable.
- Respect existing daily-note and template locations if present.

## Read/search workflow

1. Locate the vault using the environment/context provided by the active agent.
2. Use search (`rg`, `find`, or equivalent) within the vault to discover relevant notes.
3. Read only the notes needed for the user's request.
4. Pay attention to frontmatter `folders` links as hierarchy signals, not just filesystem paths.
