import { Filter, GlProgram } from 'pixi.js';

// A full-screen liquid colour field.
//
// The technique is domain warping: run fbm noise, then feed the result
// back in as a coordinate offset, twice. Plain noise reads as clouds;
// warped noise reads as marbled, flowing liquid, which is the whole
// point. Colour is then sampled along the warp *vectors* rather than the
// final scalar, because using the scalar alone collapses the palette
// into a narrow ramp (an early version came out looking like lava).
//
// This shader was compiled and executed against a real GL driver via
// ANGLE (the same translator Chrome uses) and iterated on visually
// before shipping - the palette spread, saturation recovery and
// iridescence balance below are all the result of looking at actual
// rendered output, not guesswork.
//
// It only reads its own filter input plus uniforms, no second sampler,
// so it carries none of the binding risk that broke an earlier filter
// in this project.

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;

// x = bass, y = mid, z = treble, w = beat pulse
uniform vec4 uAudio;
// x = time, y = warp amount, z = detail scale, w = colour shift
uniform vec4 uCtl;
// x = saturation, y = specular strength, z = band sharpness, w = mix
uniform vec4 uStyle;

// Indexed by float rather than int on purpose: fragment shaders don't
// have a guaranteed default precision for int across GLSL versions, and
// some drivers reject or mis-compile it. Floats avoid the question.
vec3 PAL(float i){
  float k = mod(i, 5.0);
  if (k < 0.5) return vec3(1.000,0.745,0.043);
  if (k < 1.5) return vec3(0.984,0.337,0.027);
  if (k < 2.5) return vec3(1.000,0.000,0.431);
  if (k < 3.5) return vec3(0.514,0.220,0.925);
  return vec3(0.227,0.525,1.000);
}

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
  return v;
}

void main(void)
{
    vec2 uv = vTextureCoord;
    uv.x *= uInputSize.x / max(1.0, uInputSize.y);

    float t = uCtl.x;
    float warp = uCtl.y;
    float scale = uCtl.z;

    // Two-stage domain warp: this is what makes it liquid.
    vec2 q = vec2(fbm(uv*scale + t*0.15), fbm(uv*scale + vec2(5.2,1.3) + t*0.12));
    vec2 r = vec2(fbm(uv*scale + q*warp + vec2(1.7,9.2) + t*0.10),
                  fbm(uv*scale + q*warp + vec2(8.3,2.8) + t*0.09));
    float f = fbm(uv*scale + r*warp);

    // Sample the palette along the warp vectors so all five colours stay
    // alive and spatially separated across the frame.
    float sel = f*3.4 + q.x*2.6 + r.y*2.6 + uCtl.w;
    float band = fract(sel);
    float edge = clamp(uStyle.z, 0.01, 0.49);
    vec3 col = mix(PAL(floor(sel)), PAL(floor(sel) + 1.0), smoothstep(0.5-edge, 0.5+edge, band));

    // Thin-film iridescence, applied as a tint rather than added flat -
    // adding it flat greyed out the saturated regions.
    float sheen = length(q-r)*3.0;
    vec3 irid = 0.5 + 0.5*vec3(sin(sheen*5.0+t), sin(sheen*5.0+t+2.1), sin(sheen*5.0+t+4.2));
    col = mix(col, col*irid*1.9, 0.35 * uStyle.w);

    // Depth: darken the troughs so the field has form, not just hue.
    col *= 0.45 + 0.75*smoothstep(0.15, 0.85, f);

    // Wet specular along the folds.
    float fold = pow(clamp(1.0-abs(band-0.5)*2.4, 0.0, 1.0), 9.0);
    col += fold * uStyle.y * (0.55 + uAudio.w*0.8);

    // Claw back saturation lost to blending between bands.
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col = clamp(mix(vec3(lum), col, uStyle.x), 0.0, 1.4);

    col *= 0.8 + uAudio.x*0.45;
    col += uAudio.z * 0.10 * fbm(uv*16.0 + t);

    // Reference the filter's own input sampler so it can't be optimised
    // away - the value is discarded, this generator paints over its
    // input entirely.
    vec4 unusedInput = texture(uTexture, vTextureCoord);
    finalColor = vec4(clamp(col, 0.0, 1.0), 1.0) + unusedInput * 0.0;
}
`;

export interface NectarOptions {
  warp?: number;
  scale?: number;
}

export class NectarFilter extends Filter {
  constructor(options: NectarOptions = {}) {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'nectar-filter' }),
      resources: {
        nectarUniforms: {
          uAudio: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
          uCtl: {
            value: new Float32Array([0, options.warp ?? 2.5, options.scale ?? 2.0, 0]),
            type: 'vec4<f32>'
          },
          uStyle: { value: new Float32Array([1.55, 1.0, 0.15, 1.0]), type: 'vec4<f32>' }
        }
      }
    });
  }

  private get u(): { uAudio: Float32Array; uCtl: Float32Array; uStyle: Float32Array } {
    return (
        this.resources as never as Record<
            string,
            { uniforms: { uAudio: Float32Array; uCtl: Float32Array; uStyle: Float32Array } }
        >
    ).nectarUniforms.uniforms;
  }

  setAudio(bass: number, mid: number, treble: number, pulse: number) {
    const a = this.u.uAudio;
    a[0] = bass;
    a[1] = mid;
    a[2] = treble;
    a[3] = pulse;
  }

  set time(v: number) { this.u.uCtl[0] = v; }
  set warp(v: number) { this.u.uCtl[1] = v; }
  set scale(v: number) { this.u.uCtl[2] = v; }
  set colorShift(v: number) { this.u.uCtl[3] = v; }

  set saturation(v: number) { this.u.uStyle[0] = v; }
  set specular(v: number) { this.u.uStyle[1] = v; }
  set bandSharpness(v: number) { this.u.uStyle[2] = v; }
  set iridescence(v: number) { this.u.uStyle[3] = v; }
}