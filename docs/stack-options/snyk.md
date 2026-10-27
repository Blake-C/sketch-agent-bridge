# Snyk Security At Inception

Add this block to the AGENTS.md of any project where you are writing first-party code
in a Snyk-supported language (PHP, JavaScript/TypeScript, Python, Swift, etc.).

---

## Security scanning

- Always run `snyk_code_scan` for new or modified first-party code.
- If issues are found, fix them using the Snyk results context, then rescan.
- Repeat until no new issues remain.
- Run `snyk_sca_scan` when adding or upgrading dependencies.
