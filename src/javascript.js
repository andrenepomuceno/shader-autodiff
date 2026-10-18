import { lower } from './emit.js';

/**
 * JavaScript source of `function name({ x, y, …, a, b, … })` returning `{ value, gradient }`
 * (`{ value }` for order 0), evaluating the same DAG as the GLSL output.
 */
export function emitJavaScript(compiled, name) {
  const { graph, root, gradient, variableNames, parameterNames } = compiled;
  const derivatives = gradient ?? [];
  const roots = [root, ...derivatives.filter((id) => id !== null)];
  const { temporaries, expressions } = lower(graph, roots, {
    literal: String,
    symbol: (node) => node.name,
    call: (op, args) => `Math.${op}(${args.join(', ')})`,
  });

  const [value, ...nonZero] = expressions;
  const components = derivatives.map((id) => (id === null ? '0' : nonZero.shift()));
  const lines = temporaries.map(([temporary, text]) => `  const ${temporary} = ${text};`);
  lines.push(gradient
    ? `  return { value: ${value}, gradient: [${components.join(', ')}] };`
    : `  return { value: ${value} };`);
  const symbols = [...variableNames, ...parameterNames].join(', ');
  return `function ${name}({ ${symbols} }) {\n${lines.join('\n')}\n}\n`;
}
