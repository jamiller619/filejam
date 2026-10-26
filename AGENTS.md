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
