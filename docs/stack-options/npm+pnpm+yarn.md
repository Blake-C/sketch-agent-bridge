# JavaScript package management system

Add this block to the AGENTS.md of the project.

---

## Accessing pnpm / npm / node

No package manager that manages JavaScript dependencies should ever be run on the local host machine. Always create a Dockerfile for any given project and tooling that is needed for that project, and initialize and execute PNPM, NPM, YARN, or any package manager tooling inside that container. This is done to keep the host machine safe.
