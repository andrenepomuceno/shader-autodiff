# shader-autodiff

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · **简体中文** · [Русский](README.ru.md)

把运行时输入的数学表达式转换为 GLSL/WGSL，一次计算即可同时得到它的值**和精确导数**，并提供与之对应的 CPU 端 JavaScript 求值器。无需 CAS，无需构建步骤，无任何依赖，约 15 kB。

## 安装

```bash
npm install shader-autodiff
```

也可以直接从 CDN 引入，无需构建步骤（纯 ES 模块）：

```js
import { compile } from 'https://cdn.jsdelivr.net/npm/shader-autodiff@0.1.0/src/index.js';
```

TypeScript 类型声明位于 `types/index.d.ts`。

## 用法

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

对于 three.js 节点材质和 `WebGPURenderer`，`g.tsl(TSL, { inputs: positionLocal, parameters })` 会返回基于同一张计算图构建的 TSL 节点（`value`、`gradient` 等）。

`compile({ X: '…', Y: '…', Z: '…' }, …)` 返回各分量的值以及雅可比矩阵（Jacobian）；`createProgram` 是面向结构化输出的底层 API（多个函数共享同一张图、嵌套导数、返回 `mat3` 等）。API 与生成代码的约定见 [docs/api.md](docs/api.md)，测试方式见 [docs/validation.md](docs/validation.md)。

## 示例

- [examples/three](examples/three/)：一个针对用户输入的 SDF 的 three.js 光线步进（raymarching）渲染器，法线取自精确梯度，步长也按梯度缩放（因此即使不是真正的距离场也能安全步进）。在仓库根目录启动服务（`node tools/gpu/serve.mjs`），然后打开 `/examples/three/`。
- [examples/metric-shaders](examples/metric-shaders/metric.js)：用于测地线光线追踪的度规张量及其偏导数，包括由嵌套导数得到的拉回度规。

## 为什么需要它

- **在 GPU 上获得精确且廉价的导数。** 适用于 SDF 法线、度规偏导数（克里斯托费尔符号）、变形（warp）的雅可比矩阵、曲率和牛顿迭代步。有限差分需要额外 4–7 次求值，而且总会在某些地方选错 ε。
- **运行时、用户输入的表达式。** 实时编辑器（度规编辑器、着色器 playground、绘图工具）需要在浏览器里运行安全的解析器和代码生成器，而不是离线编译器。
- **一张图，适配所有后端。** CPU 求值器与着色器结果一致，可用于测试、拾取、采样和相机逻辑。

## 设计

1. **解析器。** 一个小型 Pratt 解析器，采用白名单语法：数字、具名符号、`+ - * / ^`、一元负号，以及对固定函数表的调用。对长度、深度、节点数和指数大小设有限制（不允许幂塔）。错误信息带有位置，便于编辑器标出波浪线。
2. **AST → SSA DAG。** 哈希化（hash-consing）合并相同的子树（结构化公共子表达式消除），常量折叠，局部恒等式化简，可交换的操作数按规范顺序排列。
3. **在代码生成阶段做前向模式。** 切线（tangent）被构建为图节点，因此可与值共享子表达式，并且可以再次求导（黑塞矩阵、拉回度规）。生成的代码是**普通的标量/向量代码**：运行时没有对偶数结构体，所以驱动程序可以像优化手写代码一样优化它。零切线会被剪除：对于不依赖 `x` 的节点，其 `∂/∂x` 永远不会被输出。当尺寸合适时，梯度会被打包成 `vecN`/`matN`。
4. **规则表。** 每种运算一条记录：值规则和切线规则。`abs`/`min`/`max` 使用次梯度，`sign`/`floor` 的导数为零，整数幂展开为乘积，指数为变量的 `pow` 通过 `log` 处理。
5. **发射器。** GLSL ES 3.00（WebGL2；同时也是合法的桌面 GLSL 3.30+）、WGSL、JS、three.js TSL 节点。浮点字面量始终带小数点，临时变量命名确定（`t0, t1, …`），使差异比对稳定，并有利于着色器缓存。

## 相关工作与定位

| 项目 | 它是什么 | 本项目填补的空白 |
| --- | --- | --- |
| [Slang](https://github.com/shader-slang/slang) | 完整的着色语言，支持前向/反向自动微分；目标平台包括 GLSL、HLSL、SPIR-V、Metal、WGSL（实验性） | 笨重的原生/WASM 编译器，输入是着色器源码；不是面向浏览器中用户输入公式的小型库 |
| [glsl-autodiff](https://github.com/sibaku/glsl-autodiff) | 带对偶/超对偶类型和重载函数的 GLSL 头文件 | 需要手写 GLSL；运行时使用对偶结构体；没有解析器，也没有 CPU 对应实现 |
| [Symbolic Differentiation in GPU Shaders](https://www.microsoft.com/en-us/research/publication/symbolic-differentiation-in-gpu-shaders/) (MSR 2011) | 把导数作为 HLSL 编译器的一项功能 | 属于研究成果，并非可用的工具 |
| [Vertex shader domain warping with AD](https://arxiv.org/pdf/2405.07124) (2024) | 由宿主语言生成带导数的 GLSL | 思路相同，但只是论文，不是可复用的库 |
| [GradientScript](https://github.com/mfagerlund/gradient-script) | 源到源的梯度公式生成 | GLSL 输出情况不明 |
| [shader-ast](https://github.com/thi-ng/umbrella/tree/develop/packages/shader-ast)、swizzler | 编译为 GLSL/JS 的 TypeScript DSL | 不支持微分 |

定位：**输入字符串，输出经过优化、带导数的 GLSL/WGSL 和 JS，对用户输入安全，体积仅几 KB。**

## 首个客户端

[metric-shaders](examples/metric-shaders/metric.js)：该适配器取代了 sympy 度规编译器（`metricTensor` + `metricPartials`），使应用可以完全静态运行。每个度规预设在 CPU 上（精确到 1e-10）和 GPU 上（WebGL2 与 WebGPU，在 float32 精度范围内）都与 sympy 的结果一致。

## 基准测试

[docs/benchmarks.md](docs/benchmarks.md)：在 GPU（WebGL2 和 WebGPU）上，精确导数相对于有限差分和 sympy 生成代码的逐像素开销与 float32 精度；以及 CPU 上的编译时间、JS 吞吐量和生成代码的大小。

## 路线图

- 在更多 GPU（移动端、集成显卡）上做基准测试，并与 glsl-autodiff 的对偶数结构体比较。
- Playground 页面：输入公式，查看生成的代码，绘制值和梯度。
- 更多优化：跨求和项的公因子提取。

## 许可证

[MIT](LICENSE)
