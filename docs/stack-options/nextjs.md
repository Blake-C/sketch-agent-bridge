# Next.js Project Rules

Add this block to the AGENTS.md of any Next.js project.

---

## Next.js standards

- Use the App Router unless the project is already on Pages Router.
- Prefer Server Components by default; opt into `'use client'` only when necessary (interactivity, browser APIs, hooks).
- Co-locate page-specific components with their route segment; share across routes via `src/components/`.
- Use route handlers (`app/api/`) for API endpoints; never expose secrets to the client bundle.
- Run `next lint` and resolve all ESLint errors before committing.
- Follow BEM naming for CSS/SCSS modules; prefer CSS modules over global stylesheets.
- Always check for accessibility (WCAG 2.1 AA) when building new UI features.
