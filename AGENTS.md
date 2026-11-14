# Performance

Filejam is a filesystem browser and indexer, so speed is a product requirement.
Keep interactive filesystem reads responsive, stream large traversals instead of
materializing whole trees, batch database work, bound concurrency, and avoid
repeating metadata or IPC work. Profile realistic large volumes when changing a
hot path, and do not trade responsiveness for background indexing throughput.

# Source code style

Write source code as a thoughtful human would: prioritize readability and make
the sequence of ideas easy to follow.

- Use blank lines to separate logical steps within functions: setup, validation
  and early exits, processing or side effects, and the final return.
- Separate control-flow blocks from surrounding statements with a blank line.
  Keep an `if` / `else` chain or `try` / `catch` / `finally` together.
- Keep closely related declarations and consecutive operations on the same
  object together. Do not add a blank line after every statement mechanically.
- Put a blank line between functions and class methods, and between fields and
  the constructor. Separate React hook blocks and the final JSX return.
- Prefer curly braces for control-flow bodies, including short `if` guards and
  loops. This repository enforces them with Biome.
- Follow Biome's two-space indentation, single quotes, and existing punctuation
  conventions. Preserve intentional blank lines when formatting.
- Use meaningful names and comments that explain intent; avoid compressed code
  and comments that merely repeat the next statement.

Apply these conventions to application code, shared packages, scripts, and tests.
Do not manually restyle generated files, vendored assets, dependencies, or build
output. Run `pnpm format` and check changed code before finishing.

# Minimize owned code

The ultimate development goal is to complete each task with the least amount of
code that remains clear, maintainable, and human readable. Fewer bespoke code paths
mean fewer surfaces for bugs.

- Trace bugs to their shared source and fix the common utility or abstraction
  whenever doing so correctly resolves every affected use case.
- Reuse existing project code and consolidate repeated behavior instead of
  applying isolated fixes or creating parallel implementations.
- Prefer Node's native capabilities for features it supports well, including
  testing and TypeScript compilation, rather than adding unnecessary packages.
- Lean on mature, focused npm packages for capabilities Node does not provide,
  such as debounce and throttle, instead of recreating even small utilities.
- Before writing a new utility, check the codebase and npm ecosystem for a
  dependable existing solution. Avoid custom code unless it is genuinely
  simpler, safer, or required by project-specific behavior.

# Instruction file governance

Never create a nested `AGENTS.md`, `AGENTS.override.md`, or any equivalent agent
instruction file, and never edit the root `AGENTS.md`, without the user's prior,
express consent for that specific change.
