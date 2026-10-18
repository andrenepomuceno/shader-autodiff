# API

```js
import { compile, parse, ExpressionError, DEFAULT_LIMITS } from 'shader-autodiff';
```

## `compile(text, options)`

| Option | Default | Meaning |
| --- | --- | --- |
| `variables` | `[]` | Names differentiated with respect to, in gradient order |
| `parameters` | `[]` | Free names that are not differentiated (uniforms) |
| `derived` | `{}` | Named subexpressions, e.g. `{ r: 'sqrt(x*x + y*y + z*z)' }`; may refer to each other, not cyclically |
| `order` | `1` | `0` value only, `1` value and gradient (`2` is planned) |
| `limits` | `DEFAULT_LIMITS` | Partial override of the parser limits below |

Returns `{ order, variables, parameters, glsl(name, options), js(name), evaluate(env) }`.

- `evaluate(env)` interprets the compiled graph in JavaScript. `env` maps every variable and
  parameter the expression reads to a number. Returns `{ value }`, plus `gradient` (an array in
  `variables` order) for order 1.
- `js(name)` returns the source of an equivalent JavaScript function
  `function name({ x, y, …, a, … }) { … return { value, gradient }; }`.
- `glsl(name, { parameters })` returns a GLSL ES 3.00 function; `parameters` renames parameters in
  the emitted code (e.g. `{ a: 'u_params.x', t: 'u_time' }`), otherwise they are emitted by name.

Symbol names must be identifiers, distinct, not a built-in function or constant, and not reserved in
the emitted code: GLSL and JavaScript keywords, `Math`, `p`, `grad`, `t0`, `t1`, …, names starting
with `gl_` or containing `__`. Violations throw `TypeError`.

### Emitted GLSL

| Variables | Signature |
| --- | --- |
| 0 | `float name()` |
| 1 | `float name(float x, out float grad)`, the argument named after the variable |
| 2–4 | `float name(vecN p, out vecN grad)`, variables are `p.x`, `p.y`, … in order |
| 5+ | `float name(float u, float v, …, out float grad[N])`, one argument per variable |

With `order: 0` the `grad` argument is omitted. Temporaries are named `t0, t1, …` in a
deterministic order, float literals always contain a dot, and the code only uses GLSL ES 3.00
built-ins. The JavaScript output evaluates exactly the same DAG with the same parenthesisation.

## Grammar

```
expression := number | name | name '(' arguments ')' | '(' expression ')'
            | ('-' | '+') expression | expression ('+' | '-' | '*' | '/' | '^') expression
```

`^` (also written `**`) is right-associative and binds tighter than unary minus: `-x^2` is
`-(x^2)`, `2^-x` is `2^(-x)`. Numbers are decimal with an optional exponent (`.5`, `1e-3`).
Constants: `pi`, `E`.

| Function | Notes |
| --- | --- |
| `sin cos tan asin acos atan sinh cosh tanh exp log sqrt` | Smooth on their usual domains |
| `atan2(y, x)` | Emitted as GLSL `atan(y, x)` |
| `pow(a, b)`, `a ^ b` | Constant integer exponents become products by repeated squaring; `±0.5` becomes `sqrt`; other exponents use `pow`, which GLSL leaves undefined for `a < 0`; `E ^ b` becomes `exp(b)` |
| `abs(a)` | Derivative `sign(a)`, so 0 at 0 |
| `sign floor` | Derivative 0 (the jumps are ignored) |
| `min max` | Derivative of the selected argument; at ties one of the one-sided derivatives |
| `mod(a, b)` | Lowered to `a - b * floor(a / b)` (GLSL semantics, also in JS) |

## Limits and errors

`DEFAULT_LIMITS = { maxLength: 4000, maxDepth: 64, maxNodes: 2000, maxExponent: 32 }`.
`maxExponent` bounds the magnitude of every constant exponent after folding, which also rules out
power towers such as `2^2^2^2^2`.

Every problem with the text throws an `ExpressionError` with `reason`, `start`, `end` (character
offsets, for editor squiggles) and `source` (`'expression'` or `'derived.<name>'`): syntax errors,
limit violations, unknown symbols or functions, wrong arity, and constants that fold to a
non-finite value (`log(0)`, `sqrt(-1)`).

## How it works

1. `parse` builds a positioned AST (Pratt parser).
2. The AST is lowered into a hash-consed SSA graph: equal subexpressions share one node, constants
   fold, and local identities (`x+0`, `x*1`, `x-x`, `--x`, …) simplify.
3. For each variable, forward-mode tangents are built as new graph nodes, so derivatives share
   subexpressions with the value; a tangent that is identically zero is never built.
4. The emitters schedule the reachable graph; nodes used more than once become temporaries.
