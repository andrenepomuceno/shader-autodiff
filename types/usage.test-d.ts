import { compile, createProgram, ExpressionError, DEFAULT_LIMITS, parse } from './index.js';
const c = compile('x*y', { variables: ['x', 'y'], order: 2 });
const r = c.evaluate({ x: 1, y: 2 });
const h: number[][] | undefined = r.hessian;
const s: string = c.glsl('f', { parameters: { a: 'u_a' } });
const j = compile({ X: 'x' }, { variables: ['x'] }).evaluate({ x: 1 }).jacobian;
const p = createProgram({ variables: ['x'] });
const e = p.expression('x');
const d = p.derivative(p.mul(e, p.constant(2)), 'x');
p.glsl({ name: 'f', returns: { type: 'float', components: [d] }, outputs: [{ name: 'o', type: 'vec2', components: [e, d] }] });
try { parse('x+'); } catch (err) { if (err instanceof ExpressionError) console.log(err.start, err.reason, DEFAULT_LIMITS.maxDepth); }
