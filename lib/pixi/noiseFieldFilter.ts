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
uniform vec4 uParams; // x = scale, y = speed, z = octaves (as float, floored), w = contrast
uniform vec3 uColorA;
uniform vec3 uColorB;

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

float fbm(vec2 p, int octaves)
{
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        v += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return v;
}

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y);

    vec2 p = uv * uParams.x + vec2(uTime * uParams.y, uTime * uParams.y * 0.6);
    float n = fbm(p, int(uParams.z));
    n = clamp(pow(n, uParams.w), 0.0, 1.0);

    finalColor = vec4(mix(uColorA, uColorB, n), 1.0);
}
`;

export interface NoiseFieldOptions {
    scale?: number;
    speed?: number;
    octaves?: number;
    contrast?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class NoiseFieldFilter extends Filter {
    private clock = 0;

    constructor(options: NoiseFieldOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'noise-field-filter' });

        super({
            glProgram,
            resources: {
                noiseUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 3, options.speed ?? 0.05, options.octaves ?? 4, options.contrast ?? 1],
                        type: 'vec4<f32>'
                    },
                    uColorA: {
                        value: [options.colorA?.r ?? 0.05, options.colorA?.g ?? 0.05, options.colorA?.b ?? 0.1],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 1, options.colorB?.g ?? 0.6, options.colorB?.b ?? 0.1],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uTime: number; uParams: Float32Array; uColorA: Float32Array; uColorB: Float32Array } }
        >).noiseUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set octaves(v: number) { this.u.uParams[2] = v; }
    get octaves(): number { return this.u.uParams[2]; }
    set contrast(v: number) { this.u.uParams[3] = v; }
    get contrast(): number { return this.u.uParams[3]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
}
