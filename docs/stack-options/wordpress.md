# WordPress Project Rules

Add this block to the AGENTS.md of any WordPress project (plugin, theme, block, etc.).

---

## WordPress standards

- Follow WordPress Coding Standards (WPCS) for all PHP files.
- Run `phpcs` with the WordPress ruleset before committing PHP.
- Follow BEM naming convention for all CSS/SCSS.
- When creating new blocks, check existing blocks for the established pattern and follow it.
- Always check for accessibility (WCAG 2.1 AA) when building new UI or block features.
- Prefer native WordPress APIs over custom solutions — hooks, REST API, block API, etc.
- Avoid jQuery; use vanilla JS or the block editor's React/wp.\* packages instead.
