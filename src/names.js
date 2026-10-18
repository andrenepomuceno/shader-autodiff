import { CONSTANTS, FUNCTIONS } from './operations.js';

const GLSL = `attribute const uniform varying layout centroid flat smooth noperspective break continue do
for while switch case default if else in out inout float int void bool true false invariant discard
return mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4
ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D
sampler3D samplerCube sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow
isampler2D isampler3D isamplerCube isampler2DArray usampler2D usampler3D usamplerCube
usampler2DArray struct packed asm class union enum typedef template this goto inline noinline
volatile public static extern external interface long short double half fixed unsigned superp
input output hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 fvec2 fvec3 fvec4 sampler3DRect filter image1D
image2D image3D imageCube iimage1D iimage2D iimage3D iimageCube uimage1D uimage2D uimage3D
uimageCube image1DArray image2DArray sizeof cast namespace using`;

const JAVASCRIPT = `await break case catch class const continue debugger default delete do else enum export
extends false finally for function if implements import in instanceof interface let new null package
private protected public return static super switch this throw true try typeof var void while with
yield arguments eval undefined NaN Infinity Math`;

const GLSL_BUILT_INS = `radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log
exp2 log2 sqrt inversesqrt abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step
smoothstep isnan isinf floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat packSnorm2x16
unpackSnorm2x16 packUnorm2x16 unpackUnorm2x16 packHalf2x16 unpackHalf2x16 length distance dot cross
normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan
lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture textureSize textureProj
textureLod textureOffset texelFetch texelFetchOffset textureProjOffset textureLodOffset textureProjLod
textureProjLodOffset textureGrad textureGradOffset textureProjGrad textureProjGradOffset dFdx dFdy fwidth`;

// WGSL keywords, reserved words and the built-ins the WGSL emitter calls.
const WGSL = `alias break case const const_assert continue continuing default diagnostic discard else enable
false fn for if let loop override requires return struct switch true var while bool f16 f32 i32 u32
array atomic ptr sampler sampler_comparison texture_1d texture_2d texture_2d_array texture_3d texture_cube
texture_cube_array texture_multisampled_2d texture_depth_2d mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4
mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 function private storage workgroup uniform read write read_write
select bitcast atan2 NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto
await become binding_array cast catch class co_await co_return co_yield coherent column_major common
compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete
demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter
final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof
interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil
noexcept noinline nointerpolation noperspective null nullptr of operator package packoffset partition
pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless
register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static
static_assert static_cast std subroutine super target template this thread_local throw trait try type
typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl
where with writeonly yield`;

export const RESERVED = new Set(`${GLSL} ${GLSL_BUILT_INS} ${WGSL} ${JAVASCRIPT}`.split(/\s+/));

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isReserved(name) {
  return RESERVED.has(name) || name === '_' || /^t\d+$/.test(name) || name.startsWith('gl_') || name.includes('__');
}

/** Throws a TypeError unless `name` can be used as an identifier in every emitted language. */
export function checkIdentifier(name, what = 'symbol') {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) throw new TypeError(`invalid ${what} name '${name}'`);
  if (Object.hasOwn(FUNCTIONS, name) || Object.hasOwn(CONSTANTS, name)) throw new TypeError(`${what} '${name}' shadows a built-in`);
  if (isReserved(name)) throw new TypeError(`${what} '${name}' is reserved in the emitted code`);
}
