# shader-autodiff

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · **日本語** · [简体中文](README.zh-CN.md) · [Русский](README.ru.md)

実行時に入力された数式を、値**と厳密な導関数**を1パスで計算する GLSL/WGSL に変換します。CPU 用の対応する JavaScript 評価器も生成します。CAS 不要、ビルド手順なし、依存関係なしで、サイズは約 15 kB です。

## インストール

```bash
npm install shader-autodiff
```

または、ビルド手順なしで CDN から直接読み込めます（素の ES モジュール）。

```js
import { compile } from 'https://cdn.jsdelivr.net/npm/shader-autodiff@0.1.0/src/index.js';
```

TypeScript の型宣言は `types/index.d.ts` に同梱されています。

## 使い方

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

three.js のノードマテリアルと `WebGPURenderer` 向けには、`g.tsl(TSL, { inputs: positionLocal, parameters })` が同じグラフから構築した TSL ノード（`value`、`gradient` など）を返します。

`compile({ X: '…', Y: '…', Z: '…' }, …)` は値とヤコビ行列を返します。`createProgram` は構造化された出力（1つのグラフを共有する複数の関数、入れ子の導関数、`mat3` の戻り値）のための低レベル API です。API と生成コードの仕様については [docs/api.md](docs/api.md)、テスト方法については [docs/validation.md](docs/validation.md) を参照してください。

## 例

- [examples/three](examples/three/): 入力した SDF をレイマーチングする three.js のレイマーチャーです。法線は厳密な勾配から求め、ステップ幅も勾配でスケールします（そのため、距離場でないフィールドでも安全にマーチングできます）。リポジトリのルートを配信（`node tools/gpu/serve.mjs`）し、`/examples/three/` を開いてください。
- [examples/metric-shaders](examples/metric-shaders/metric.js): 測地線レイトレーシング向けの計量テンソルとその偏導関数です。入れ子の導関数によるプルバック計量も含みます。

## 目的

- **GPU 上での厳密で低コストな導関数。** SDF の法線、計量の偏導関数（クリストッフェル記号）、ワープのヤコビ行列、曲率、ニュートン法のステップなどに使えます。有限差分では追加で 4〜7 回の評価が必要になり、しかもどこかで不適切になる ε を選ぶ必要があります。
- **実行時にユーザーが入力する式。** ライブエディター（計量エディター、シェーダーのプレイグラウンド、グラフ描画ツール）には、オフラインのコンパイラーではなく、ブラウザー内で動作する安全なパーサーとコード生成が必要です。
- **1つのグラフ、すべてのバックエンド。** CPU 評価器はシェーダーと同じ結果を返すため、テスト、ピッキング、サンプリング、カメラのロジックに使えます。

## 設計

1. **パーサー。** 許可リスト方式の文法を持つ小さな Pratt パーサーです。数値、名前付きシンボル、`+ - * / ^`、単項マイナス、固定の関数表に対する呼び出しのみを受け付けます。長さ、深さ、ノード数、指数の大きさ（べき乗の塔は不可）に上限があります。エラーには位置情報が付くため、エディターの波線表示に使えます。
2. **AST → SSA DAG。** ハッシュコンスィングにより等しい部分木を統合し（構造的な CSE）、定数を畳み込み、局所的な恒等式で簡約し、可換な被演算子を正規の順序に並べます。
3. **コード生成時の前進モード。** 接ベクトル（タンジェント）はグラフのノードとして構築されるため、値と部分式を共有でき、再度の微分（ヘッセ行列、プルバック計量）も可能です。生成されるコードは**素のスカラー/ベクトルコード**で、実行時に双対数の構造体は現れません。そのため、ドライバーは手書きのコードと同様に最適化できます。ゼロの接ベクトルは除去されます。つまり、`x` に依存しないノードの `∂/∂x` は一切出力されません。勾配は、サイズが合えば `vecN`/`matN` にまとめられます。
4. **規則表。** 演算ごとに1エントリで、値の規則と接ベクトルの規則を持ちます。`abs`/`min`/`max` には劣勾配を、`sign`/`floor` にはゼロの導関数を使い、整数べきは積として、指数が変数の `pow` は `log` を経由して扱います。
5. **エミッター。** GLSL ES 3.00（WebGL2。デスクトップ GLSL 3.30 以降でも有効）、WGSL、JS、three.js の TSL ノードに対応します。浮動小数点リテラルは常に小数点付きで、一時変数名は決定的（`t0, t1, …`）なので、差分が安定し、シェーダーキャッシュも効きます。

## 先行事例と位置づけ

| プロジェクト | 概要 | 本ライブラリが埋める隙間 |
| --- | --- | --- |
| [Slang](https://github.com/shader-slang/slang) | 前進/後退モードの自動微分を備えた本格的なシェーディング言語。GLSL、HLSL、SPIR-V、Metal、WGSL（実験的）を対象とする | 重いネイティブ/WASM コンパイラーで、入力はシェーダーソース。ブラウザー内でユーザーが入力した数式を扱う小さなライブラリではない |
| [glsl-autodiff](https://github.com/sibaku/glsl-autodiff) | 双対数/超双対数の型とオーバーロード関数を備えた GLSL ヘッダー | GLSL を手書きする必要があり、実行時に双対数の構造体が現れ、パーサーも CPU 版もない |
| [Symbolic Differentiation in GPU Shaders](https://www.microsoft.com/en-us/research/publication/symbolic-differentiation-in-gpu-shaders/) (MSR 2011) | HLSL コンパイラーの機能としての導関数 | 研究であり、利用可能なツールではない |
| [Vertex shader domain warping with AD](https://arxiv.org/pdf/2405.07124) (2024) | ホスト言語が導関数付きの GLSL を生成する | 発想は同じだが、論文であり、再利用可能なライブラリではない |
| [GradientScript](https://github.com/mfagerlund/gradient-script) | ソースからソースへの勾配式の変換 | GLSL への出力が不明 |
| [shader-ast](https://github.com/thi-ng/umbrella/tree/develop/packages/shader-ast)、swizzler | GLSL/JS にコンパイルされる TypeScript の DSL | 微分機能なし |

狙いどころは、**文字列を入力すると、最適化された導関数付きの GLSL/WGSL と JS が出力され、ユーザー入力に対して安全で、わずか数 KB で済む**ことです。

## 最初のクライアント

[metric-shaders](examples/metric-shaders/metric.js): このアダプターは sympy ベースの計量コンパイラー（`metricTensor` + `metricPartials`）を置き換え、アプリを完全に静的に実行できるようにします。すべての計量プリセットが、CPU 上では sympy の値と（1e-10 まで）、GPU 上（WebGL2 と WebGPU）では float32 の精度の範囲内で一致します。

## ベンチマーク

[docs/benchmarks.md](docs/benchmarks.md): GPU(WebGL2 と WebGPU)上での、厳密な導関数の有限差分および sympy 生成コードに対するピクセルあたりのコストと float32 精度、そして CPU 上でのコンパイル時間、JS のスループット、生成コードのサイズ。

## ロードマップ

- より多くの GPU(モバイル、内蔵)でのベンチマークと、glsl-autodiff の双対数構造体との比較。
- プレイグラウンドページ: 数式を入力すると、生成コードが表示され、値と勾配がプロットされます。
- さらなる最適化: 和にまたがる共通因子の抽出。

## ライセンス

[MIT](LICENSE)
