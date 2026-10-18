import { lower } from './emit.js';

const COMPONENTS = ['x', 'y', 'z', 'w'];
const NAMES = { atan2: 'atan' };

export function glslFloat(value) {
  const text = String(value);
  if (/^-?\d+$/.test(text)) return `${text}.0`;
  if (/e/.test(text) && !text.includes('.')) return text.replace('e', '.0e');
  return text;
}

function vectorType(size) {
  return size === 1 ? 'float' : `vec${size}`;
}

/**
 * GLSL ES 3.00 function computing the value and, for order 1, the gradient:
 *   1 variable      float name(float x, out float grad)
 *   2–4 variables   float name(vecN p, out vecN grad)      (x, y, … are p.x, p.y, …)
 *   5+ variables    float name(float x0, …, out float grad[N])
 * Parameters are free identifiers (uniforms), renamed through `parameters`.
 */
export function emitGlsl(compiled, name, { parameters = {} } = {}) {
  const { graph, root, gradient, variableNames } = compiled;
  const count = variableNames.length;
  const packed = count >= 2 && count <= 4;
  const variableText = (index) => (packed ? `p.${COMPONENTS[index]}` : variableNames[index]);

  const derivatives = gradient ?? [];
  const roots = [root, ...derivatives.filter((id) => id !== null)];
  const { temporaries, expressions } = lower(graph, roots, {
    literal: glslFloat,
    symbol: (node) => (node.op === 'var' ? variableText(node.index) : parameters[node.name] ?? node.name),
    call: (op, args) => `${NAMES[op] ?? op}(${args.join(', ')})`,
  });

  const [value, ...nonZero] = expressions;
  const components = derivatives.map((id) => (id === null ? '0.0' : nonZero.shift()));

  const signature = packed
    ? [`${vectorType(count)} p`]
    : variableNames.map((variable) => `float ${variable}`);
  const lines = temporaries.map(([temporary, text]) => `    float ${temporary} = ${text};`);
  if (gradient) {
    if (packed) {
      signature.push(`out ${vectorType(count)} grad`);
      lines.push(`    grad = ${vectorType(count)}(${components.join(', ')});`);
    } else if (count === 1) {
      signature.push('out float grad');
      lines.push(`    grad = ${components[0]};`);
    } else if (count > 0) {
      signature.push(`out float grad[${count}]`);
      components.forEach((text, index) => lines.push(`    grad[${index}] = ${text};`));
    }
  }
  lines.push(`    return ${value};`);
  return `float ${name}(${signature.join(', ')}) {\n${lines.join('\n')}\n}\n`;
}
