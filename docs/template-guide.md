# Template Guide

This file details the reason and purpose and usage of each of the files within this template project.

## CHANGELOG.md

Each entry sits under one of six level three headings:

- Added: new features or capabilities
- Changed: modifications to existing functionality
- Deprecated: features planned for removal
- Removed: features no longer supported
- Fixed: bug fixes and defect corrections
- Security: vulnerability fixes

Version numbers follow semver, where major covers breaking or
architectural changes, minor covers backward-compatible features,
and patch covers bug fixes.

The rest of the format follows these rules:

- The level two heading is the version, a hyphen, then the release
  date: `## [1.2.0] - 2026-10-12`
- Remove any heading with nothing under it.
- Each entry starts with a past-tense verb.
- Sub-details indent under their parent entry.
- One level three heading per type per version. Consolidate
  duplicates and keep entries in the order the changes happened.
- Describe what the change does for someone using the project. Leave out the steps it took to build.

## docs

The docs directory should be used to create markdown documentation files to detail different parts of the project as needed. Do not leave comments in the code. Do not leave narrative in the code. They should be documented in the docs directory.

## docs/stack-options

The Stack Options directory lists out several different types of coding stacks that could potentially be used on a new project. This is only utilized during the initialization process of a new project, where the agent will pick whatever stack is being used based on the user feedback and then copy that out into the AGENTS.md file for the new project and then the stack-options directory gets deleted.

## PROJECT.md

The PROJECT.md file is used by the author of the project to detail what will be built out, how it will be built out, and any necessary details that should be passed on to other developers as the project is structured. This should not be used as documentation, this should be used to describe the project.

## README.md

The README.md file should be used to give a brief overview of what the project is, what it does, and the key details of how to use the project. How to stand it up, how to modify it, any security insights, it should be brief, concise, and kept to a minimum. The agent writes the first pass during setup from what the user says the project is, which is the last step in AGENTS.md.

## AGENTS.md & CLAUDE.md

The CLAUDE & AGENTS markdown files are used to pass along information to the AI agents being used on the project. The CLAUDE.md file is a symlink to AGENTS.md and is created from the initilization script that creates new projects. These files should never go above 300 lines long. If they do start to approach that length, we should look into pushing sections into documentation, looking for dead sections to remove, or creating more concise versions of existing sections.

## CHALLENGES.md

The challenge file should be used to document any challenges that are found along the way while building the project. This could potentially be used in the future to help write articles on the challenges about the project. If you don't document them, we might not have a clear source of reference of what happened and when it happened and what the fix was.

## Ignores

Before committing, be sure we've ignored all potentially needed ignored files from different ignoring types, such as .gitignore, .prettierignore, .stylelintignore, and config.yaml exclusions. We should think through what should end up in production, and what should be excluded from that production environment via an exclusion.

## .editorconfig

The .editorconfig file is shared between developers and allows the code editor to display the code as needed in the format settings described in this file. This should be adjusted for each language as needed to ensure proper formatting between developers.

## .gitignore

Add to the .gitignored file, depending on what project is being built. The project structure and options selected by the user will help you determine what files and directories ought to be ignored and removed and kept out of the code repo. Any secrets, sensitive files, databases, or large files should be ignored.

## .claude/settings.json

Use this custom .claude/settings.json file to customize how agents should behave for any given project. Also be sure to include any skills & hooks that ought to be shared between developers inside this directory.

## guardrail-options.md

The guardrails file lists tools that are already known to work here, with what each one is for. Use it to pick the tools that check and test what an agent produces on this project.
