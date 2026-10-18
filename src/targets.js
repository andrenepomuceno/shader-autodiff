import { lower } from './emit.js';
import { checkIdentifier } from './names.js';

const COMPONENTS = ['x', 'y', 'z', 'w'];
const FLOAT32_MAX = 3.4028234663852886e38;

export function glslFloat(value) {
  const text = String(value);
  if (/^-?\d+$/.test(text)) return `${text}.0`;
  if (/e/.test(text) && !text.includes('.')) return text.replace('e', '.0e');
  return text;
}

/** A literal for a 32-bit float shader; constants that do not fit are an error, not an infinity. */
function shaderFloat(value) {
  if (Math.abs(value) > FLOAT32_MAX) throw new RangeError(`constant ${value} does not fit in a 32-bit float`);
  return glslFloat(value);
}

export function vectorType(size) {
  if (size === 1) return 'float';
  return size >= 2 && size <= 4 ? `vec${size}` : `float[${size}]`;
}

export function matrixType(columns, rows) {
  if (columns === 0 || rows === 0) return 'float[0]';
  if (columns === 1) return vectorType(rows);
  if (rows === 1) return vectorType(columns);
  if (columns <= 4 && rows <= 4) return columns === rows ? `mat${columns}` : `mat${columns}x${rows}`;
  return `float[${columns * rows}]`;
}

/** float, vecN, matN, matCxR (C columns, R rows) or float[N]; float[0] only exists in JS. */
export function parseType(type) {
  let match;
  if (type === 'float') return { kind: 'float', size: 1 };
  if ((match = /^vec([234])$/.exec(type))) return { kind: 'vec', size: Number(match[1]) };
  if ((match = /^mat([234])(?:x([234]))?$/.exec(type))) {
    const columns = Number(match[1]);
    const rows = Number(match[2] ?? match[1]);
    return { kind: 'mat', columns, rows, size: columns * rows };
  }
  if ((match = /^float\[(0|[1-9]\d*)\]$/.exec(type))) return { kind: 'array', size: Number(match[1]) };
  throw new TypeError(`unsupported type '${type}'`);
}

/**
 * The JS shape of an output: null for a scalar, [n] for a flat array, [rows, columns] for a
 * matrix given column-major and returned as an array of rows (`m[row][column]`).
 */
export function shapeOf(output) {
  if (output.shape) return output.shape;
  const type = parseType(output.type);
  if (type.kind === 'float') return null;
  if (type.kind === 'mat') return [type.rows, type.columns];
  return [type.size];
}

export function arrange(values, shape) {
  if (shape === null) return values[0];
  if (shape.length === 1) return values;
  const [rows, columns] = shape;
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (__, column) => values[column * rows + row]));
}

export function shapeValues(output, values) {
  return arrange(values, shapeOf(output));
}

function variableInputs(variables) {
  const count = variables.length;
  if (count >= 2 && count <= 4) {
    return { packed: true, names: ['p'], vector: count, symbol: (index) => `p.${COMPONENTS[index]}` };
  }
  return { packed: false, names: [...variables], symbol: (index) => variables[index] };
}

const LANGUAGES = {
  glsl: {
    literal: shaderFloat,
    call: (op, args) => `${op === 'atan2' ? 'atan' : op}(${args.join(', ')})`,
    select: (a, b, c, d) => `(${a} < ${b} ? ${c} : ${d})`,
    type(type) {
      return type.kind === 'array' ? 'float' : type.kind === 'vec' ? `vec${type.size}` : type.kind === 'mat'
        ? (type.columns === type.rows ? `mat${type.columns}` : `mat${type.columns}x${type.rows}`)
        : 'float';
    },
    temporary: (name, text) => `    float ${name} = ${text};`,
    input: (name, size) => `${size === 1 ? 'float' : `vec${size}`} ${name}`,
    output: (name, type, text) => (type.kind === 'array' ? `out float ${name}[${type.size}]` : `out ${text} ${name}`),
    assign: (name, value) => `    ${name} = ${value};`,
    assignElement: (name, index, value) => `    ${name}[${index}] = ${value};`,
    construct: (typeText, values) => `${typeText}(${values.join(', ')})`,
    signature: (name, inputs, returnType) => `${returnType ?? 'void'} ${name}(${inputs.join(', ')}) {`,
  },
  wgsl: {
    literal: shaderFloat,
    call: (op, args) => `${op}(${args.join(', ')})`,
    select: (a, b, c, d) => `select(${d}, ${c}, ${a} < ${b})`,
    type(type) {
      if (type.kind === 'array') return `array<f32, ${type.size}>`;
      if (type.kind === 'vec') return `vec${type.size}<f32>`;
      if (type.kind === 'mat') return `mat${type.columns}x${type.rows}<f32>`;
      return 'f32';
    },
    temporary: (name, text) => `    let ${name} = ${text};`,
    input: (name, size) => `${name}: ${size === 1 ? 'f32' : `vec${size}<f32>`}`,
    output: (name, _, text) => `${name}: ptr<function, ${text}>`,
    assign: (name, value) => `    *${name} = ${value};`,
    assignElement: (name, index, value) => `    (*${name})[${index}] = ${value};`,
    construct: (typeText, values) => `${typeText}(${values.join(', ')})`,
    signature: (name, inputs, returnType) => `fn ${name}(${inputs.join(', ')})${returnType ? ` -> ${returnType}` : ''} {`,
  },
};

function serialize(value) {
  return Array.isArray(value) ? `[${value.map(serialize).join(', ')}]` : value;
}

/**
 * Names must be valid everywhere. In shaders the function, its arguments, its outputs and the
 * parameters emitted by name share one scope; in JS outputs are object keys next to `value`.
 */
function checkSpec(spec, scope) {
  const { name, returns, outputs = [] } = spec;
  checkIdentifier(name, 'function');
  outputs.forEach((output) => checkIdentifier(output.name, 'output'));
  for (const parameter of scope.parameters) {
    if (scope.arguments.includes(parameter)) throw new TypeError(`parameter '${parameter}' collides with the argument '${parameter}'; rename it`);
  }
  const taken = new Set([...scope.arguments, ...scope.parameters, ...(returns ? ['value'] : [])]);
  for (const [label, identifier] of [...(scope.js ? [] : [['function', name]]), ...outputs.map((output) => ['output', output.name])]) {
    if (taken.has(identifier)) throw new TypeError(`${label} name '${identifier}' collides with another name in the emitted code`);
    taken.add(identifier);
  }
  for (const output of [...(returns ? [returns] : []), ...outputs]) {
    const type = parseType(output.type);
    if (output.components.length !== type.size) {
      throw new TypeError(`'${output.type}' needs ${type.size} components, got ${output.components.length}`);
    }
  }
  if (returns && parseType(returns.type).kind === 'array') throw new TypeError('cannot return an array');
}

/**
 * Emits one function in `language` ('glsl', 'wgsl' or 'js') from
 *   { name, returns?: { type, components }, outputs?: [{ name, type, components, shape? }], parameters? }
 * Inputs are the program variables: one scalar argument for 1 or 5+ variables, else `p` as a vector.
 */
export function emitFunction(language, context, spec) {
  const { graph, variables, parameters } = context;
  const { name, returns, outputs = [], parameters: renames = {} } = spec;
  const inputs = variableInputs(variables);
  checkSpec(spec, language === 'js'
    ? { js: true, arguments: [], parameters: [] }
    : { arguments: inputs.names, parameters: parameters.filter((parameter) => !Object.hasOwn(renames, parameter)) });

  const all = [...(returns ? [returns] : []), ...outputs];
  const roots = all.flatMap((output) => output.components);
  const target = language === 'js'
    ? {
        literal: String,
        symbol: (node) => node.name,
        call: (op, args) => `Math.${op}(${args.join(', ')})`,
        select: LANGUAGES.glsl.select,
      }
    : {
        ...LANGUAGES[language],
        symbol: (node) => (node.op === 'var' ? inputs.symbol(node.index) : renames[node.name] ?? node.name),
      };
  const { temporaries, expressions } = lower(graph, roots, target);
  const take = (output) => expressions.splice(0, output.components.length);

  if (language === 'js') {
    const lines = temporaries.map(([temporary, text]) => `  const ${temporary} = ${text};`);
    const fields = all.map((output) => `${output === returns ? 'value' : output.name}: ${serialize(shapeValues(output, take(output)))}`);
    lines.push(`  return { ${fields.join(', ')} };`);
    return `function ${name}({ ${[...variables, ...parameters].join(', ')} }) {\n${lines.join('\n')}\n}\n`;
  }

  const syntax = LANGUAGES[language];
  const signature = inputs.packed
    ? [syntax.input('p', inputs.vector)]
    : variables.map((variable) => syntax.input(variable, 1));
  const lines = temporaries.map(([temporary, text]) => syntax.temporary(temporary, text));
  const returnValues = returns ? take(returns) : null;
  for (const output of outputs) {
    const type = parseType(output.type);
    const typeText = syntax.type(type);
    const values = take(output);
    if (type.size === 0) continue;
    signature.push(syntax.output(output.name, type, typeText));
    if (type.kind === 'array') values.forEach((value, index) => lines.push(syntax.assignElement(output.name, index, value)));
    else lines.push(syntax.assign(output.name, type.kind === 'float' ? values[0] : syntax.construct(typeText, values)));
  }
  let returnType = null;
  if (returns) {
    const type = parseType(returns.type);
    returnType = syntax.type(type);
    lines.push(`    return ${type.kind === 'float' ? returnValues[0] : syntax.construct(returnType, returnValues)};`);
  }
  return `${syntax.signature(name, signature, returnType)}\n${lines.join('\n')}\n}\n`;
}
