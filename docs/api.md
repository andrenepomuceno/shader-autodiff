# API

```js
import { compile, createProgram, parse, ExpressionError, DEFAULT_LIMITS } from 'shader-autodiff';
```

## `compile(source, options)`

`source` is one expression, or an object of named expressions (`{ X: '…', Y: '…' }`, names must be
identifiers) for Jacobian mode.

| Option | Default | Meaning |
| --- | --- | --- |
| `variables` | `[]` | Names differentiated with respect to, in gradient order |
| `parameters` | `[]` | Free names that are not differentiated (uniforms) |
| `derived` | `{}` | Named subexpressions, e.g. `{ r: 'sqrt(x*x + y*y + z*z)' }`; may refer to each other, not cyclically |
| `order` | `1` | `0` value, `1` gradient (or Jacobian), `2` Hessian (single expression only) |
| `limits` | `DEFAULT_LIMITS` | Partial override of the parser limits below |

Returns `{ order, variables, parameters, outputs, glsl(name, options), wgsl(name, options), js(name), evaluate(env) }`.

- `evaluate(env)` interprets the compiled graph in JavaScript. `env` maps every variable and
  parameter the expression reads to a number.
  - Single expression: `{ value, gradient: [n], hessian: [[n×n]] }` (as far as `order` asks).
  - Named expressions: `{ value: [m], jacobian: [[m×n]] }`, rows in the order of the object keys,
    `jacobian[i][j] = ∂F_i/∂x_j`.
  - The Hessian is computed once per pair `i ≤ j` and mirrored, so it is exactly symmetric.
  - With no variables, `gradient`, `hessian` and the Jacobian rows are empty arrays, and the shader
    functions have no derivative outputs.
- `js(name)` returns the source of `function name({ x, y, …, a, … })` returning exactly what
  `evaluate` returns.
- `glsl(name, { parameters })` and `wgsl(name, { parameters })` return one shader function;
  `parameters` renames parameters in the emitted code (e.g. `{ a: 'u_params.x', t: 'u_time' }`),
  otherwise they are emitted by name and must be visible to the function (uniforms, constants).

### Emitted shader functions

Arguments are the variables: with 2–4 variables one vector `p` (`p.x`, `p.y`, … in variable order),
otherwise one `float` per variable named after it. Results:

| Output | Single expression | Named expressions |
| --- | --- | --- |
| value | return value, `float` | `out value`: `float`, `vecM` or `float[M]` |
| `gradient` / `jacobian` | `out gradient`: `float`, `vecN` or `float[N]` | `out jacobian`: `matNxM` (N columns ∂F/∂x_j), or `float[N·M]` column by column |
| `hessian` | `out hessian`: `float`, `matN` or `float[N·N]` | – |

GLSL uses `out` parameters and `void` when nothing is returned. WGSL uses
`ptr<function, T>` parameters (`f(p, &gradient)`) and `array<f32, N>` for arrays.

```glsl
float f(vec3 p, out vec3 gradient) { … }
```
```wgsl
fn f(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32 { … }
```

Temporaries are named `t0, t1, …` in a deterministic order, float literals always contain a dot
(a folded constant outside the float32 range makes `glsl`/`wgsl` throw a `RangeError`),
GLSL output only uses GLSL ES 3.00 built-ins, and every target evaluates exactly the same DAG with
the same parenthesisation (`min`/`max` tie branches use `a < b ? … : …` in GLSL and JS and
`select` in WGSL).

### three.js TSL

`tsl(TSL, { inputs, parameters })` builds the same outputs as three.js
[TSL](https://threejs.org/docs/#manual/en/introduction/Three-Shading-Language) nodes, for node
materials and `WebGPURenderer` (WebGPU, or its WebGL2 fallback). The caller passes the TSL namespace,
so this library does not depend on three:

```js
import * as TSL from 'three/tsl';

const sdf = compile('length3 - 1 + 0.1 * sin(5 * x + t)', {
  variables: ['x', 'y', 'z'], parameters: ['t'], derived: { length3: 'sqrt(x*x + y*y + z*z)' },
});
const { value, gradient } = sdf.tsl(TSL, { inputs: TSL.positionLocal, parameters: { t: TSL.time } });
material.normalNode = TSL.transformNormalToView(TSL.normalize(gradient));
```

- `inputs`: a vector node for 2–4 variables (`inputs.x`, `inputs.y`, … in variable order), an array
  of scalar nodes, or an object of scalar nodes by variable name.
- `parameters`: TSL nodes (uniforms) for every parameter the expressions use.
- Results: outputs whose shader type is `float`, `vecN` or `matN` come back as one TSL node (a square
  Jacobian is a `matN` node whose column j is ∂F/∂x_j, like in GLSL); other outputs (non-square
  Jacobians, more than 4 variables) come back shaped like `evaluate`, as arrays or arrays of rows of
  nodes. A plain object passed as `inputs` is read by variable name; any other object is treated as a
  TSL node. Constants outside the float32 range throw a `RangeError`, as in GLSL and WGSL.
- Every graph node becomes one TSL node object, so TSL shares common subexpressions. TSL has no
  hyperbolic functions, so `sinh`, `cosh` and `tanh` are built from `exp` there.

## `createProgram(options)`

The low-level API behind `compile`, for clients that need structured outputs (a metric tensor and its
partials, say). Takes `variables`, `parameters`, `derived` and `limits` as above. All expressions of a
program share one graph, so common subexpressions are shared across everything emitted together.

| Method | Returns |
| --- | --- |
| `expression(text, source?)` | A handle (an integer) for the parsed expression; `source` labels errors |
| `constant(value)`, `add(a, b)`, `sub(a, b)`, `mul(a, b)`, `div(a, b)`, `neg(a)` | Handles; arguments must be handles |
| `derivative(handle, variable)` | ∂/∂variable as a handle, which can be differentiated again |
| `isZero(handle)` | Whether the handle is the constant 0 |
| `evaluate(handles, env)` | Array of numbers |
| `glsl(spec)`, `wgsl(spec)`, `js(spec)` | Source of one function |
| `tsl(spec, TSL, { inputs, parameters })` | TSL nodes for the spec outputs (see above) |
| `evaluateFunction(spec, env)` | What the emitted JS function returns |

A function spec is

```js
{
  name: 'metricPartials',
  returns: { type: 'mat3', components: [/* 9 handles, column-major */] },   // optional
  outputs: [{ name: 'dgdx', type: 'mat3', components: [/* … */] }],        // optional
  parameters: { a: 'u_params.x' },                                          // optional renames
}
```

Types are `float`, `vec2`–`vec4`, `mat2`–`mat4`, `matCxR` (C columns, R rows) and `float[N]`
(outputs only). Matrices take their components column-major; in JS they come back as arrays of rows
(`m[row][column]`), vectors and arrays as flat arrays, an optional `shape: [rows, columns]` on an
output overrides that. In JS the return value is the `value` field of the returned object.

## Names

Symbol names must be identifiers, distinct, not a built-in function or constant, and not reserved in
any emitted language: GLSL, WGSL and JavaScript keywords and reserved words, GLSL built-in function
names, `select`, `Math`, `_`, `t0`, `t1`, …, names starting with `gl_` or containing `__`. Function
and output names follow the same rule; in shaders they must also not collide with an argument,
another output, or a parameter that is emitted by name (JS outputs are object keys, so they cannot
collide). Violations throw `TypeError`.

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
| `pow(a, b)`, `a ^ b` | Constant integer exponents become products by repeated squaring; `±0.5` becomes `sqrt`; other exponents use `pow`, which GLSL and WGSL leave undefined for `a < 0`; `E ^ b` becomes `exp(b)` |
| `abs(a)` | Derivative `sign(a)`, so 0 at 0 |
| `sign floor` | Derivative 0 (the jumps are ignored) |
| `min max` | Derivative of the selected argument; at ties one of the one-sided derivatives |
| `mod(a, b)` | Lowered to `a - b * floor(a / b)` (GLSL semantics, in every target) |
| `fract(a)` | `a - floor(a)` |
| `exp2(a)`, `log2(a)` | `pow(2, a)` and `log(a) / ln 2` |
| `clamp(x, lo, hi)` | `min(max(x, lo), hi)` |
| `mix(a, b, t)` | `a + (b - a) * t` |
| `step(edge, x)` | `x < edge ? 0 : 1`, derivative 0 |
| `smoothstep(e0, e1, x)` | `t = clamp((x - e0) / (e1 - e0), 0, 1)`, then `t * t * (3 - 2 * t)` |

Functions without a native counterpart in every target are lowered into the operations above, so
GLSL, WGSL and JS evaluate the same formula (not the driver's own `mix` or `smoothstep`).

## Limits and errors

`DEFAULT_LIMITS = { maxLength: 4000, maxDepth: 64, maxNodes: 2000, maxExponent: 32 }`.
`maxExponent` bounds the magnitude of every constant exponent after folding, which also rules out
power towers such as `2^2^2^2^2`.

Every problem with the text throws an `ExpressionError` with `reason`, `start`, `end` (character
offsets, for editor squiggles) and `source` (`'expression'`, the output name, or `'derived.<name>'`):
syntax errors, limit violations, unknown symbols or functions, wrong arity, and constants that fold to
a non-finite value (`log(0)`, `sqrt(-1)`).

## How it works

1. `parse` builds a positioned AST (Pratt parser).
2. The AST is lowered into a hash-consed SSA graph: equal subexpressions share one node, constants
   fold, and local identities (`x+0`, `x*1`, `x-x`, `--x`, …) simplify.
3. Forward-mode tangents are built as new graph nodes, so derivatives share subexpressions with the
   value and can be differentiated again (Hessians are tangents of tangents). A tangent that is
   identically zero is never built.
4. The emitters schedule the reachable graph; nodes used more than once become temporaries.
