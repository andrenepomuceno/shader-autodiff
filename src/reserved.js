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

const OUTPUT = 'p grad';

export const RESERVED = new Set(`${GLSL} ${JAVASCRIPT} ${OUTPUT}`.split(/\s+/));

export function isReserved(name) {
  return RESERVED.has(name) || /^t\d+$/.test(name) || name.startsWith('gl_') || name.includes('__');
}
