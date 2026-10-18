"""Dev-only tool: generate reference values from the sibling metric-shaders project.

Evaluates every metric preset (tensor, partials) with sympy and writes a JSON fixture
that the shader-autodiff tests compare against. Nothing in src/ depends on this script.

Run with the metric-shaders virtualenv (sympy and the package installed):

    D:/Desktop/metric-shaders/.venv/Scripts/python tools/metric-shaders/reference.py \
        --metric-shaders D:/Desktop/metric-shaders --out test/fixtures/metric-shaders.json
"""

import argparse
import json
import math
import random
import re
import sys
import zlib
from pathlib import Path

import mpmath
import sympy

SAMPLES_PER_PRESET = 8
MAX_ATTEMPTS = 50
MIN_RADIUS = 0.2
POINT_RANGE = 3.0
UNDECLARED_PARAM = 0.5
PRECISION_DIGITS = 30
PARAM_NAMES = ("a", "b", "c", "d")


def load_presets(preset_dir):
    presets = [json.loads(path.read_text(encoding="utf-8")) for path in preset_dir.glob("*.json")]
    return sorted(presets, key=lambda preset: preset["id"])


def draw_point(rng):
    while True:
        point = [rng.uniform(-POINT_RANGE, POINT_RANGE) for _ in range(3)]
        if math.sqrt(sum(v * v for v in point)) >= MIN_RADIUS:
            return point


def draw_uniforms(rng, params, first):
    declared = {p["name"]: p for p in params}
    uniforms = {}
    for name in PARAM_NAMES:
        if name not in declared:
            uniforms[name] = UNDECLARED_PARAM
        elif first:
            uniforms[name] = declared[name]["default"]
        else:
            uniforms[name] = rng.uniform(declared[name]["min"], declared[name]["max"])
    if first:
        uniforms["t"], uniforms["s"] = 1.25, 1.0
    else:
        uniforms["t"], uniforms["s"] = rng.uniform(0, 10), rng.uniform(0, 1)
    return uniforms


def to_rows(matrix):
    rows = []
    for i in range(3):
        row = []
        for j in range(3):
            value = complex(matrix[i, j])
            if value.imag != 0 or not math.isfinite(value.real):
                raise ValueError("non-finite or complex value")
            row.append(value.real)
        rows.append(row)
    return rows


def evaluate(evaluators, point, uniforms):
    args = [*point, uniforms["t"], *(uniforms[n] for n in PARAM_NAMES), uniforms["s"]]
    metric_fn, partial_fns = evaluators
    return {
        "point": point,
        "uniforms": uniforms,
        "metric": to_rows(metric_fn(*args)),
        "partials": [to_rows(fn(*args)) for fn in partial_fns],
    }


def make_evaluators(symbols, matrix, coordinates):
    def compile_matrix(m):
        return sympy.lambdify(symbols, m, "mpmath")

    return compile_matrix(matrix), [compile_matrix(matrix.diff(c)) for c in coordinates]


def draw_sample(rng, preset, evaluators, first):
    for attempt in range(MAX_ATTEMPTS):
        point = draw_point(rng)
        uniforms = draw_uniforms(rng, preset["params"], first)
        try:
            return evaluate(evaluators, point, uniforms), attempt
        except (ValueError, ZeroDivisionError, TypeError):
            continue
    raise RuntimeError(f"{preset['id']}: no finite sample in {MAX_ATTEMPTS} attempts")


def build_preset(preset, metric_module, models):
    spec = models.MetricSpec(**preset["spec"])
    matrix = metric_module.metric_matrix(spec)
    m = metric_module
    symbols = (m.X, m.Y, m.Z, m.T, m.A, m.B, m.C, m.D, m.S)
    evaluators = make_evaluators(symbols, matrix, m.COORDINATES)
    rng = random.Random(zlib.crc32(preset["id"].encode("utf-8")))
    samples, redraws = [], 0
    for index in range(SAMPLES_PER_PRESET):
        sample, attempts = draw_sample(rng, preset, evaluators, index == 0)
        samples.append(sample)
        redraws += attempts
    entry = {
        "id": preset["id"],
        "kind": preset["spec"]["kind"],
        "components": preset["spec"]["components"],
        "params": preset["params"],
        "glsl": m.compile_metric(spec),
        "samples": samples,
    }
    return entry, redraws


NUMBER_ROW = re.compile(r"\[\s*(?:-?[0-9.eE+-]+,?\s*)+\]")


def dump(document):
    """Indent-1 JSON with numeric rows collapsed onto one line to keep the fixture small."""
    text = json.dumps(document, indent=1)
    return NUMBER_ROW.sub(lambda m: re.sub(r"\s+", "", m.group(0)).replace(",", ", "), text) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--metric-shaders", required=True, type=Path, help="metric-shaders checkout")
    parser.add_argument("--out", required=True, type=Path, help="fixture path to write")
    args = parser.parse_args()

    sys.path.insert(0, str(args.metric_shaders / "src"))
    from metric_shaders import metric as metric_module, models

    mpmath.mp.dps = PRECISION_DIGITS
    preset_dir = args.metric_shaders / "src" / "metric_shaders" / "presets" / "metrics"
    entries = []
    for preset in load_presets(preset_dir):
        entry, redraws = build_preset(preset, metric_module, models)
        entries.append(entry)
        print(f"{entry['id']}: {len(entry['samples'])} samples, {redraws} redraws")

    document = {"generator": "tools/metric-shaders/reference.py", "sympy": sympy.__version__, "presets": entries}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(dump(document), encoding="utf-8", newline="
")


if __name__ == "__main__":
    main()
