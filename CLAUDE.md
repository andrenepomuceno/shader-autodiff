# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

A dependency-free JavaScript library that parses user-typed math expressions with a safe allow-list
grammar and emits GLSL, WGSL and JavaScript computing the value and exact derivatives (forward mode
applied at codegen time, with CSE and zero-tangent pruning). See `README.md` for the design.

## Commands

```bash
node --test          # tests (Node 20+)
```

No build step, no runtime dependencies. Dev-only tools may use Python (e.g. sympy cross-checks)
but nothing in `src/` may depend on them.

## Conventions

- Clean, self-documenting code; comments only for non-obvious formulas or workarounds.
- Documentation lives in `docs/`; update it when the public API or emitted code contract changes.
- `README.md` has translations (`README.pt-BR.md`, `README.ja.md`, `README.zh-CN.md`, `README.ru.md`);
  update them in the same commit as any README change, keeping code blocks and links identical.
- Every feature gets `node --test` coverage; emitted code gets golden tests.
- Emitted GLSL uses float literals with a dot and GLSL ES 3.00 built-ins unless the target says
  otherwise.

## Task workflow

- Pending work: one Markdown file per task in `tasks-inbox/`; move it to `tasks-done/` (`git mv`)
  in the same commit as the work.
- Commit in small, coherent steps.

## Subagents

Up to 5 parallel subagents, no nested agents. Pick the model by task difficulty
(haiku for simple/mechanical, sonnet for standard, opus for hard math/shaders).
Fable is not used in this project.
