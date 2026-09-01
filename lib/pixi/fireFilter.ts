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

const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform vec4 uInputSize;
uniform float uTime;
uniform vec4 uParams; // x = scale, y = speed, z = turbulence, w = bass boost
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform float uAudioBass;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p)
{
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.02;
        amp *= 0.5;
    }
    return v;
}

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y);

    // Rises from the bottom: sample noise moving downward as uv.y increases,
    // and fade intensity out toward the top of the frame.
    vec2 p = uv * uParams.x;
    p.y -= uTime * uParams.y * 3.0;
    p.x += fbm(p * 0.6 + uTime * 0.1) * uParams.z;

    float n = fbm(p);
    float rise = 1.0 - uv.y;
    float heat = clamp(n * rise * (1.5 + uAudioBass * uParams.w), 0.0, 1.5);

    vec3 col = mix(uColorLow, uColorMid, clamp(heat * 1.3, 0.0, 1.0));
    col = mix(col, uColorHigh, clamp((heat - 0.7) * 2.0, 0.0, 1.0));

    finalColor = vec4(col, 1.0);
}
`;

export interface FireOptions {
    scale?: number;
    speed?: number;
    turbulence?: number;
    bassBoost?: number;
    colorLow?: { r: number; g: number; b: number };
    colorMid?: { r: number; g: number; b: number };
    colorHigh?: { r: number; g: number; b: number };
}

export class FireFilter extends Filter {
    private clock = 0;

    constructor(options: FireOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'fire-filter' });

        super({
            glProgram,
            resources: {
                fireUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 3, options.speed ?? 0.3, options.turbulence ?? 0.6, options.bassBoost ?? 0.5],
                        type: 'vec4<f32>'
                    },
                    uColorLow: {
                        value: [options.colorLow?.r ?? 0.05, options.colorLow?.g ?? 0, options.colorLow?.b ?? 0],
                        type: 'vec3<f32>'
                    },
                    uColorMid: {
                        value: [options.colorMid?.r ?? 1, options.colorMid?.g ?? 0.4, options.colorMid?.b ?? 0],
                        type: 'vec3<f32>'
                    },
                    uColorHigh: {
                        value: [options.colorHigh?.r ?? 1, options.colorHigh?.g ?? 0.95, options.colorHigh?.b ?? 0.6],
                        type: 'vec3<f32>'
                    },
                    uAudioBass: { value: 0, type: 'f32' }
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
                    uColorMid: Float32Array;
                    uColorHigh: Float32Array;
                    uAudioBass: number;
                };
            }
        >).fireUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set turbulence(v: number) { this.u.uParams[2] = v; }
    get turbulence(): number { return this.u.uParams[2]; }
    set bassBoost(v: number) { this.u.uParams[3] = v; }
    get bassBoost(): number { return this.u.uParams[3]; }

    setColorLow(r: number, g: number, b: number) {
        this.u.uColorLow[0] = r; this.u.uColorLow[1] = g; this.u.uColorLow[2] = b;
    }
    setColorMid(r: number, g: number, b: number) {
        this.u.uColorMid[0] = r; this.u.uColorMid[1] = g; this.u.uColorMid[2] = b;
    }
    setColorHigh(r: number, g: number, b: number) {
        this.u.uColorHigh[0] = r; this.u.uColorHigh[1] = g; this.u.uColorHigh[2] = b;
    }
    setAudio(bass: number) {
        this.u.uAudioBass = bass;
    }
}
