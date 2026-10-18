"""Dev-only tool: cross-check shader-autodiff against sympy on random expressions.

Generates random expressions in the library's surface syntax (domain-guarded so they stay smooth
at the sample points), differentiates them exactly with sympy and writes value, gradient and
Hessian at a few random points to a JSON fixture. Nothing in src/ depends on this script.

    D:/Desktop/metric-shaders/.venv/Scripts/python tools/sympy/random-expressions.py \
        --out test/fixtures/sympy-random.json
"""

import argparse
import json
import math
import random
import re
from pathlib import Path

import mpmath
import sympy

SEED = 20240607
EXPRESSIONS = 200
SAMPLES = 3
MAX_DEPTH = 4
MAX_LENGTH = 600
MAX_MAGNITUDE = 1e8
TIE_MARGIN = 1e-3
ORIGIN_MARGIN = 0.05
MAX_TRIG_ARGUMENT = 1e3  # sin/cos of larger arguments amplify double rounding beyond the test tolerance
PRECISION_DIGITS = 30

x, y, z, a, b = SYMBOLS = sympy.symbols("x y z a b", real=True)
VARIABLES = (x, y, z)
RANGES = {"x": (-2, 2), "y": (-2, 2), "z": (-2, 2), "a": (0.2, 1.5), "b": (0.5, 2)}


def number(rng):
    return str(rng.choice([rng.randint(1, 4), round(rng.uniform(0.2, 3.5), 1)]))


def paren(text):
    return text if re.fullmatch(r"[A-Za-z]+|\d+(\.\d+)?", text) else f"({text})"


class Generator:
    """Builds expression text; `checks` collects (kind, text, text) near-singularity guards."""

    def __init__(self, rng):
        self.rng = rng
        self.checks = []

    def leaf(self):
        return self.rng.choice(["x", "x", "y", "y", "z", "z", "a", "b", "pi", "E", number(self.rng), number(self.rng)])

    def gen(self, depth):
        rng = self.rng
        if depth == 0 or rng.random() < 0.12:
            return self.leaf()
        d = depth - 1

        def u():
            return paren(self.gen(d))

        def bare():
            return self.gen(d)

        choices = [
            (6, lambda: f"({bare()} + {bare()})"),
            (4, lambda: f"({bare()} - {bare()})"),
            (6, lambda: f"({bare()} * {bare()})"),
            (1, lambda: f"(-{u()})"),
            (4, lambda: f"({bare()} / (1 + {u()}^2))"),
            (3, lambda: f"({bare()} / (2 + {u()}^2 + {u()}^2))"),
            (5, lambda: f"{u()}^{rng.randint(1, 5)}"),
            (2, lambda: f"(1 + {u()}^2)^{rng.choice(['1.5', '0.5', '-0.5', '2.5', '-1.5', '0.3'])}"),
            (2, lambda: f"pow(1 + {u()}^2, {bare()})"),
            (2, lambda: f"pow({rng.choice(['2', '3', '1.5', '0.5', 'E'])}, {bare()})"),
            (2, lambda: f"E^{u()}"),
            (3, lambda: self.trig("sin", d)),
            (3, lambda: self.trig("cos", d)),
            (2, lambda: self.bounded("tan", 1)),
            (2, lambda: f"atan({bare()})"),
            (2, lambda: self.bounded("asin", 2)),
            (2, lambda: self.bounded("acos", 2)),
            (2, lambda: self.bounded("sinh", 1)),
            (2, lambda: self.bounded("cosh", 1)),
            (2, lambda: f"tanh({bare()})"),
            (2, lambda: f"exp(-{u()}^2 / (1 + {u()}^2))"),
            (2, lambda: self.bounded("exp", 1)),
            (3, lambda: f"log(1 + {u()}^2)"),
            (3, lambda: f"sqrt(1 + {u()}^2)"),
            (2, lambda: f"sqrt(0.5 + {u()}^2 + {u()}^2)"),
            (2, lambda: f"atan2({bare()}, 1 + {u()}^2)"),
            (1, self.atan2_raw),
            (0.5, lambda: self.tie("min")),
            (0.5, lambda: self.tie("max")),
            (0.5, self.abs_call),
        ]
        return rng.choices([f for _, f in choices], [w for w, _ in choices])[0]()

    def bounded(self, name, shift):
        """f(s / (shift + s^2)): the argument stays within +-0.5 (shift 1) or +-0.36 (shift 2)."""
        s = paren(self.gen(2))
        return f"{name}({s} / ({shift} + {s}^2))"

    def trig(self, name, depth):
        p = self.gen(depth)
        self.checks.append(("small", p, None))
        return f"{name}({p})"

    def tie(self, name):
        p, q = self.gen(2), self.gen(2)
        self.checks.append(("tie", p, q))
        return f"{name}({p}, {q})"

    def abs_call(self):
        p = self.gen(2)
        self.checks.append(("zero", p, None))
        return f"abs({p})"

    def atan2_raw(self):
        p, q = self.gen(2), self.gen(2)
        self.checks.append(("origin", p, q))
        return f"atan2({p}, {q})"


NAMESPACE = {
    "R": sympy.Rational, "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan, "asin": sympy.asin,
    "acos": sympy.acos, "atan": sympy.atan, "atan2": sympy.atan2, "sinh": sympy.sinh,
    "cosh": sympy.cosh, "tanh": sympy.tanh, "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
    "abs": lambda p: sympy.Piecewise((p, p >= 0), (-p, True)),
    "pow": lambda p, q: p**q,
    "min": lambda p, q: sympy.Piecewise((p, p < q), (q, True)),
    "max": lambda p, q: sympy.Piecewise((p, p > q), (q, True)),
    "pi": sympy.pi, "E": sympy.E, "x": x, "y": y, "z": z, "a": a, "b": b,
}
NUMBER = re.compile(r"(?<![\w.])(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)")


def to_sympy(text):
    """Parse our surface syntax; literals become exact rationals, ^ becomes **.

    abs/min/max are Piecewise, which sympy differentiates for arbitrary arguments.
    """
    python = NUMBER.sub(lambda m: f"R('{m.group(1)}')", text).replace("^", "**")
    return eval(python, {"__builtins__": {}}, NAMESPACE)  # generated text only


def guards_ok(checks, env):
    def value(text):
        return float(sympy.lambdify(SYMBOLS, to_sympy(text), "math")(*env))

    for kind, p, q in checks:
        if kind == "small" and abs(value(p)) > MAX_TRIG_ARGUMENT:
            return False
        if kind == "zero" and abs(value(p)) < TIE_MARGIN:
            return False
        if kind == "tie" and abs(value(p) - value(q)) < TIE_MARGIN:
            return False
        if kind == "origin" and math.hypot(value(p), value(q)) < ORIGIN_MARGIN:
            return False
    return True


def finite(v):
    v = mpmath.mpmathify(v)
    if isinstance(v, mpmath.mpc):
        if abs(v.imag) > 1e-20 * (1 + abs(v.real)):
            raise ValueError("complex")
        v = v.real
    if not mpmath.isfinite(v) or abs(v) > MAX_MAGNITUDE:
        raise ValueError("non-finite or huge")
    return float(v)


def build_samples(text, checks, rng):
    expr = to_sympy(text)
    gradient = [sympy.diff(expr, v) for v in VARIABLES]
    hessian = [[sympy.diff(g, v) for v in VARIABLES] for g in gradient]
    outputs = [expr, *gradient, *[h for row in hessian for h in row]]
    evaluate = sympy.lambdify(SYMBOLS, outputs, "mpmath")
    samples = []
    for _ in range(SAMPLES):
        env = [rng.uniform(*RANGES[s.name]) for s in SYMBOLS]
        try:
            if not guards_ok(checks, env):
                continue
            v = [finite(o) for o in evaluate(*env)]
        except (ValueError, ZeroDivisionError, TypeError, OverflowError):
            continue
        samples.append({
            "env": dict(zip((s.name for s in SYMBOLS), env)),
            "value": v[0],
            "gradient": v[1:4],
            "hessian": [v[4:7], v[7:10], v[10:13]],
        })
    return samples


NUMBER_ROW = re.compile(r"\[\s*(?:-?[0-9.eE+-]+,?\s*)+\]")
NUMBER_OBJECT = re.compile(r"\{\s*(?:\"\w+\":\s*-?[0-9.eE+-]+,?\s*)+\}")


def dump(document):
    """Indent-1 JSON with numeric rows and env objects collapsed onto one line."""
    text = json.dumps(document, indent=1)
    text = NUMBER_ROW.sub(lambda m: re.sub(r"\s+", "", m.group(0)).replace(",", ", "), text)
    text = NUMBER_OBJECT.sub(lambda m: re.sub(r"\s+", " ", m.group(0)).replace("{ ", "{").replace(" }", "}"), text)
    return text + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, type=Path, help="fixture path to write")
    args = parser.parse_args()

    mpmath.mp.dps = PRECISION_DIGITS
    rng = random.Random(SEED)
    cases, rejected, seen = [], 0, set()
    while len(cases) < EXPRESSIONS:
        generator = Generator(rng)
        text = generator.gen(MAX_DEPTH)
        if len(text) >= MAX_LENGTH or text in seen or not re.search(r"[xyz]", text):
            continue
        seen.add(text)
        samples = build_samples(text, generator.checks, rng)
        if not samples:
            rejected += 1
            continue
        cases.append({"text": text, "samples": samples})
    total = sum(len(c["samples"]) for c in cases)
    print(f"{len(cases)} cases, {total} samples, {rejected} expressions rejected")

    document = {"generator": "tools/sympy/random-expressions.py", "sympy": sympy.__version__, "cases": cases}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(dump(document), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
