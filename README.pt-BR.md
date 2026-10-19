# shader-autodiff

[English](README.md) · **Português (Brasil)** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Русский](README.ru.md)

Transforme uma expressão matemática digitada em tempo de execução em GLSL/WGSL que calcula seu valor **e suas derivadas exatas** em uma única passada, além de um avaliador JavaScript equivalente para a CPU. Sem CAS, sem etapa de build, sem dependências, cerca de 15 kB.

## Instalação

```bash
npm install shader-autodiff
```

Ou direto de um CDN, sem etapa de build (módulos ES puros):

```js
import { compile } from 'https://cdn.jsdelivr.net/npm/shader-autodiff@0.1.0/src/index.js';
```

As declarações TypeScript acompanham o pacote em `types/index.d.ts`.

## Uso

```js
import { compile } from 'shader-autodiff';

const g = compile('(1 + a/(2*sqrt(r^2 + b^2)))^4', {
  variables: ['x', 'y', 'z'],          // differentiate with respect to these
  parameters: ['a', 'b', 't'],          // uniforms, not differentiated
  derived: { r: 'sqrt(x*x + y*y + z*z)' },
  order: 1,                             // 0 value, 1 gradient, 2 Hessian
});

g.glsl('conformal', { parameters: { a: 'u_params.x', b: 'u_params.y' } })
// float conformal(vec3 p, out vec3 gradient) { ... }
g.wgsl('conformal')                     // fn conformal(p: vec3<f32>, gradient: ptr<function, vec3<f32>>) -> f32
g.js('conformal')                       // source of the same function in JS
g.evaluate({ x, y, z, a, b, t })        // { value, gradient } computed from the same graph
```

Para node materials do three.js e o `WebGPURenderer`, `g.tsl(TSL, { inputs: positionLocal, parameters })` retorna nós TSL (`value`, `gradient`, …) construídos a partir do mesmo grafo.

`compile({ X: '…', Y: '…', Z: '…' }, …)` retorna os valores e a jacobiana, e `createProgram` é a API de baixo nível para saídas estruturadas (várias funções compartilhando um mesmo grafo, derivadas aninhadas, retornos `mat3`). Veja [docs/api.md](docs/api.md) para a API e o contrato do código emitido, e [docs/validation.md](docs/validation.md) para saber como tudo é testado.

## Exemplos

- [examples/three](examples/three/): um raymarcher em three.js para SDFs digitadas por você, com normais obtidas do gradiente exato e passos escalados por ele (assim, até campos que não são distâncias avançam com segurança). Sirva a raiz do repositório (`node tools/gpu/serve.mjs`) e abra `/examples/three/`.
- [examples/tsl](examples/tsl/): um exemplo com o `WebGPURenderer` do three.js (WebGPU, ou `?webgl` para o fallback WebGL2) cujo `MeshStandardNodeMaterial` recebe o `positionNode` e o `normalNode` por pixel de `tsl()`: digite um campo de altura h(x, z), ou uma deformação X, Y, Z de uma esfera, caixa ou barra, cujas normais são transformadas pela jacobiana exata. Abra `/examples/tsl/` no mesmo servidor.
- [examples/metric-shaders](examples/metric-shaders/metric.js): tensores métricos e suas derivadas parciais para ray tracing de geodésicas, incluindo métricas de pullback a partir de derivadas aninhadas.

## Por quê

- **Derivadas exatas e baratas na GPU.** Normais de SDF, derivadas parciais da métrica (símbolos de Christoffel), jacobianas de deformações (warps), curvatura, passos de Newton. Diferenças finitas custam de 4 a 7 avaliações extras e exigem um ε que sempre está errado em algum ponto.
- **Expressões digitadas pelo usuário, em tempo de execução.** Editores ao vivo (editores de métricas, playgrounds de shader, ferramentas de gráficos) precisam de um parser seguro e de geração de código no navegador, não de um compilador offline.
- **Um grafo, todos os backends.** O avaliador na CPU coincide com o shader, para testes, picking, amostragem e lógica de câmera.

## Design

1. **Parser.** Um pequeno parser de Pratt com gramática de lista de permissões (allow-list): números, símbolos nomeados, `+ - * / ^`, menos unário e chamadas a uma tabela fixa de funções. Há limites para comprimento, profundidade, número de nós e tamanho do expoente (sem torres de potências). Os erros trazem posições, para sublinhados no editor.
2. **AST → DAG em SSA.** Hash-consing une subárvores iguais (CSE estrutural), constantes são dobradas, identidades locais são simplificadas e os operandos comutativos são colocados em ordem canônica.
3. **Modo direto (forward) em tempo de geração de código.** As tangentes são construídas como nós do grafo, então compartilham subexpressões com o valor e podem ser derivadas de novo (hessianas, métricas de pullback). O código emitido é **código escalar/vetorial simples**: sem structs duais em tempo de execução, de modo que o driver o otimiza como código escrito à mão. Tangentes nulas são podadas: `∂/∂x` de um nó que não depende de `x` nunca é emitida. Os gradientes são empacotados em `vecN`/`matN` quando os tamanhos permitem.
4. **Tabela de regras.** Uma entrada por operação: regra do valor e regra da tangente. Subgradientes para `abs`/`min`/`max`, derivada zero para `sign`/`floor`, potências inteiras como produtos, `pow` com expoente variável via `log`.
5. **Emissores.** GLSL ES 3.00 (WebGL2; também válido em GLSL desktop 3.30+), WGSL, JS, nós TSL do three.js. Literais float sempre com ponto, temporárias determinísticas (`t0, t1, …`) para diffs estáveis e cache de shaders.

## Trabalhos relacionados e posicionamento

| Projeto | O que é | Lacuna que este projeto preenche |
| --- | --- | --- |
| [Slang](https://github.com/shader-slang/slang) | Linguagem de shading completa com autodiff direto/reverso; gera GLSL, HLSL, SPIR-V, Metal, WGSL (experimental) | Compilador nativo/WASM pesado, com código-fonte de shader como entrada; não é uma biblioteca pequena para fórmulas digitadas pelo usuário em um navegador |
| [glsl-autodiff](https://github.com/sibaku/glsl-autodiff) | Header GLSL com tipos duais/hiperduais e funções sobrecarregadas | Você escreve o GLSL à mão; structs duais em tempo de execução; sem parser, sem equivalente na CPU |
| [Symbolic Differentiation in GPU Shaders](https://www.microsoft.com/en-us/research/publication/symbolic-differentiation-in-gpu-shaders/) (MSR 2011) | Derivadas como recurso do compilador HLSL | Pesquisa, não uma ferramenta disponível |
| [Vertex shader domain warping with AD](https://arxiv.org/pdf/2405.07124) (2024) | A linguagem hospedeira gera GLSL com derivadas | A mesma ideia, mas é um artigo, não uma biblioteca reutilizável |
| [GradientScript](https://github.com/mfagerlund/gradient-script) | Fórmulas de gradiente de código-fonte para código-fonte | Saída GLSL incerta |
| [shader-ast](https://github.com/thi-ng/umbrella/tree/develop/packages/shader-ast), swizzler | DSLs em TypeScript compiladas para GLSL/JS | Sem diferenciação |

O nicho: **string de entrada, GLSL/WGSL + JS otimizados e com derivadas de saída, seguros para entrada de usuário, em poucos KB.**

## Primeiro cliente

[metric-shaders](examples/metric-shaders/metric.js): o adaptador substitui o compilador de métricas baseado em sympy (`metricTensor` + `metricPartials`), para que o app possa rodar de forma totalmente estática. Todos os presets de métrica coincidem com os valores do sympy na CPU (até 1e-10) e na GPU (WebGL2 e WebGPU, dentro da precisão de float32).

## Benchmarks

[docs/benchmarks.md](docs/benchmarks.md): custo por pixel e precisão em float32 das derivadas exatas
contra diferenças finitas e código gerado pelo sympy na GPU (WebGL2 e WebGPU), além de tempo de
compilação, throughput em JS e tamanho do código emitido na CPU.

## Próximos passos

- Benchmarks em mais GPUs (móveis, integradas) e contra as structs duais do glsl-autodiff.
- Página de playground: digite uma fórmula, veja o código e plote o valor e o gradiente.
- Mais otimização: extração de fatores comuns entre somas.

## Licença

[MIT](LICENSE)
