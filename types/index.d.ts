export interface Limits {
  maxLength: number;
  maxDepth: number;
  maxNodes: number;
  maxExponent: number;
}

export const DEFAULT_LIMITS: Readonly<Limits>;

export class ExpressionError extends Error {
  readonly name: 'ExpressionError';
  /** The message without the source and position prefix. */
  readonly reason: string;
  /** Character offsets of the offending span. */
  readonly start: number;
  readonly end: number;
  /** 'expression', an output name, or 'derived.<name>'. */
  readonly source: string;
}

export type AstNode =
  | { type: 'number'; value: number; start: number; end: number }
  | { type: 'name'; name: string; start: number; end: number }
  | { type: 'call'; name: string; args: AstNode[]; start: number; end: number }
  | { type: 'unary'; op: 'neg'; arg: AstNode; start: number; end: number }
  | { type: 'binary'; op: 'add' | 'sub' | 'mul' | 'div' | 'pow'; left: AstNode; right: AstNode; start: number; end: number };

export function parse(text: string, options?: { source?: string; limits?: Partial<Limits> }): AstNode;

export interface SymbolOptions {
  /** Names differentiated with respect to, in gradient order. */
  variables?: readonly string[];
  /** Free names that are not differentiated (uniforms). */
  parameters?: readonly string[];
  /** Named subexpressions, e.g. { r: 'sqrt(x*x + y*y + z*z)' }. */
  derived?: Readonly<Record<string, string>>;
  limits?: Partial<Limits>;
}

export interface CompileOptions extends SymbolOptions {
  /** 0 value, 1 gradient (or Jacobian), 2 Hessian (single expression only). Default 1. */
  order?: 0 | 1 | 2;
}

export interface ShaderOptions {
  /** Renames parameters in the emitted code, e.g. { a: 'u_params.x', t: 'u_time' }. */
  parameters?: Readonly<Record<string, string>>;
}

export type Env = Readonly<Record<string, number>>;

export interface ScalarResult {
  value: number;
  gradient?: number[];
  /** hessian[i][j] = ∂²f/∂xi∂xj, exactly symmetric. */
  hessian?: number[][];
}

export interface VectorResult {
  value: number[];
  /** jacobian[i][j] = ∂F_i/∂x_j. */
  jacobian?: number[][];
}

export interface Compiled<Result> {
  readonly order: 0 | 1 | 2;
  readonly variables: string[];
  readonly parameters: string[];
  /** Output names for named expressions, null for a single expression. */
  readonly outputs: string[] | null;
  glsl(name: string, options?: ShaderOptions): string;
  wgsl(name: string, options?: ShaderOptions): string;
  /** Source of `function name({ ...variables, ...parameters })` returning what `evaluate` returns. */
  js(name: string): string;
  evaluate(env: Env): Result;
}

export function compile(source: string, options?: CompileOptions): Compiled<ScalarResult>;
export function compile(source: Readonly<Record<string, string>>, options?: CompileOptions & { order?: 0 | 1 }): Compiled<VectorResult>;

/** An opaque handle to an expression of a program. */
export type Handle = number & { readonly __handle?: never };

/** float, vec2–vec4, mat2–mat4, matCxR, float[N]. */
export type ShaderType = string;

export interface Output {
  type: ShaderType;
  /** Matrices column-major. */
  components: readonly Handle[];
  /** JS shape override: [n] flat, [rows, columns] for an array of rows. */
  shape?: readonly [number] | readonly [number, number];
}

export interface FunctionSpec extends ShaderOptions {
  name: string;
  returns?: Output | null;
  outputs?: ReadonlyArray<Output & { name: string }>;
}

export interface Program {
  readonly variables: readonly string[];
  readonly parameters: readonly string[];
  expression(text: string, source?: string): Handle;
  constant(value: number): Handle;
  add(a: Handle, b: Handle): Handle;
  sub(a: Handle, b: Handle): Handle;
  mul(a: Handle, b: Handle): Handle;
  div(a: Handle, b: Handle): Handle;
  neg(a: Handle): Handle;
  derivative(expression: Handle, variable: string): Handle;
  isZero(expression: Handle): boolean;
  evaluate(expressions: readonly Handle[], env: Env): number[];
  /** `{ value?, [output]: number | number[] | number[][] }`, as the emitted JS returns it. */
  evaluateFunction(spec: FunctionSpec, env: Env): Record<string, number | number[] | number[][]>;
  glsl(spec: FunctionSpec): string;
  wgsl(spec: FunctionSpec): string;
  js(spec: FunctionSpec): string;
}

export function createProgram(options?: SymbolOptions): Program;
