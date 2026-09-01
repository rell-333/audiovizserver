import { Filter, GlProgram } from 'pixi.js';

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

// Only three scalar bands are available (bass/mid/treble), not a full
// spectrum array, so bar heights are built by interpolating across those
// three anchor points by bar position, plus a small per-bar hash jitter
// for shimmer so it doesn't look like exactly three repeated values.
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform vec4 uInputSize;
uniform float uTime;
uniform vec4 uParams; // x = barCount, y = gap, z = jitter, w = smoothing
uniform vec3 uColorLow;
uniform vec3 uColorHigh;
uniform vec3 uAudio; // bass, mid, treble

float hash11(float n)
{
    return fract(sin(n) * 43758.5453123);
}

void main(void)
{
    float bars = max(2.0, floor(uParams.x));
    float barIndex = floor(vTextureCoord.x * bars);
    float t = barIndex / max(bars - 1.0, 1.0);

    float band = t < 0.5
        ? mix(uAudio.x, uAudio.y, t * 2.0)
        : mix(uAudio.y, uAudio.z, (t - 0.5) * 2.0);

    float jitter = (hash11(barIndex * 12.9898 + floor(uTime * 8.0)) - 0.5) * uParams.z;
    float height = clamp(band + jitter, 0.0, 1.5);

    vec2 cellUv = fract(vec2(vTextureCoord.x * bars, vTextureCoord.y));
    float inGap = step(cellUv.x, uParams.y) + step(1.0 - uParams.y, cellUv.x);

    float fromBottom = 1.0 - vTextureCoord.y;
    float filled = step(fromBottom, height) * (1.0 - min(inGap, 1.0));

    vec3 col = mix(uColorLow, uColorHigh, clamp(fromBottom / max(height, 0.001), 0.0, 1.0));
    finalColor = vec4(col * filled, 1.0);
}
`;

export interface SpectrumBarsOptions {
    barCount?: number;
    gap?: number;
    jitter?: number;
    smoothing?: number;
    colorLow?: { r: number; g: number; b: number };
    colorHigh?: { r: number; g: number; b: number };
}

export class SpectrumBarsFilter extends Filter {
    private clock = 0;

    constructor(options: SpectrumBarsOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'spectrum-bars-filter' });

        super({
            glProgram,
            resources: {
                spectrumUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.barCount ?? 24, options.gap ?? 0.1, options.jitter ?? 0.05, options.smoothing ?? 0.2],
                        type: 'vec4<f32>'
                    },
                    uColorLow: {
                        value: [options.colorLow?.r ?? 0.1, options.colorLow?.g ?? 0.8, options.colorLow?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorHigh: {
                        value: [options.colorHigh?.r ?? 1, options.colorHigh?.g ?? 0.1, options.colorHigh?.b ?? 0.6],
                        type: 'vec3<f32>'
                    },
                    uAudio: { value: [0, 0, 0], type: 'vec3<f32>' }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            {
                uniforms: {
                    uTime: number;
                    uParams: Float32Array;
                    uColorLow: Float32Array;
                    uColorHigh: Float32Array;
                    uAudio: Float32Array;
                };
            }
        >).spectrumUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set barCount(v: number) { this.u.uParams[0] = v; }
    get barCount(): number { return this.u.uParams[0]; }
    set gap(v: number) { this.u.uParams[1] = v; }
    get gap(): number { return this.u.uParams[1]; }
    set jitter(v: number) { this.u.uParams[2] = v; }
    get jitter(): number { return this.u.uParams[2]; }
    set smoothing(v: number) { this.u.uParams[3] = v; }
    get smoothing(): number { return this.u.uParams[3]; }

    setColorLow(r: number, g: number, b: number) {
        this.u.uColorLow[0] = r; this.u.uColorLow[1] = g; this.u.uColorLow[2] = b;
    }
    setColorHigh(r: number, g: number, b: number) {
        this.u.uColorHigh[0] = r; this.u.uColorHigh[1] = g; this.u.uColorHigh[2] = b;
    }
    setAudio(bass: number, mid: number, treble: number) {
        this.u.uAudio[0] = bass; this.u.uAudio[1] = mid; this.u.uAudio[2] = treble;
    }
}
