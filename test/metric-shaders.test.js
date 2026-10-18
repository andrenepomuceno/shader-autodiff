import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMetric } from '../examples/metric-shaders/metric.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/metric-shaders.json', import.meta.url), 'utf8'));

/** Largest entry-wise error, relative to the size of the reference matrix. */
function matrixError(actual, expected) {
  const scale = 1 + Math.max(...expected.flat().map(Math.abs));
  return Math.max(...actual.flat().map((value, index) => Math.abs(value - expected.flat()[index]))) / scale;
}

test('fixture covers every metric-shaders preset', () => {
  assert.equal(fixture.presets.length, 17);
  for (const preset of fixture.presets) assert.equal(preset.samples.length, 8, preset.id);
});

for (const preset of fixture.presets) {
  test(`metric-shaders preset ${preset.id} matches sympy`, () => {
    const compiled = compileMetric({ kind: preset.kind, components: preset.components });
    for (const sample of preset.samples) {
      const { metric, partials } = compiled.evaluate(sample.point, sample.uniforms);
      const where = `${preset.id} at ${JSON.stringify(sample.point)} ${JSON.stringify(sample.uniforms)}`;
      assert.ok(matrixError(metric, sample.metric) < 1e-12, `metric ${where}`);
      partials.forEach((partial, k) => {
        assert.ok(matrixError(partial, sample.partials[k]) < 1e-10, `d/d${'xyz'[k]} ${where}: ${matrixError(partial, sample.partials[k])}`);
      });
    }
  });
}

test('emitted metric functions keep the metric-shaders signatures', () => {
  const { glsl, wgsl } = compileMetric({ kind: 'tensor', components: { xx: 'a', xy: '0', xz: '0', yy: 'b*r', yz: '0', zz: '1' } });
  assert.match(glsl, /^mat3 metricTensor\(vec3 p\) \{/);
  assert.match(glsl, /\nvoid metricPartials\(vec3 p, out mat3 dgdx, out mat3 dgdy, out mat3 dgdz\) \{/);
  assert.match(glsl, /u_params\.x/);
  assert.match(glsl, /u_morph/);
  assert.match(wgsl, /^fn metricTensor\(p: vec3<f32>\) -> mat3x3<f32> \{/);
});

test('metric specs are validated', () => {
  assert.throws(() => compileMetric({ kind: 'tensor', components: { xx: '1' } }), /needs exactly the components/);
  assert.throws(() => compileMetric({ kind: 'warp', components: {} }), /unknown metric kind/);
  assert.throws(() => compileMetric({ kind: 'pullback', components: { X: 'x', Y: 'y', Z: 'w' } }), /unknown symbol 'w'/);
});
