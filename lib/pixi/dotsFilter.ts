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
uniform vec4 uParams; // x = spacing, y = radius, z = jitter, w = pulse-with-beat amount
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAudioBeat;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y);

    vec2 grid = uv * uParams.x;
    vec2 cell = floor(grid);
    vec2 f = fract(grid) - 0.5;

    float h = hash21(cell);
    vec2 jitter = (vec2(hash21(cell + 2.0), hash21(cell + 5.0)) - 0.5) * uParams.z;

    float radius = uParams.y * (1.0 + uAudioBeat * uParams.w);
    float d = length(f - jitter);
    float dot_ = smoothstep(radius, radius - 0.03, d);

    vec3 col = mix(uColorB, uColorA, dot_);
    finalColor = vec4(col, 1.0);
}
`;

export interface DotsOptions {
    spacing?: number;
    radius?: number;
    jitter?: number;
    beatPulse?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class DotsFilter extends Filter {
    private clock = 0;

    constructor(options: DotsOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'dots-filter' });

        super({
            glProgram,
            resources: {
                dotsUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.spacing ?? 12, options.radius ?? 0.25, options.jitter ?? 0, options.beatPulse ?? 0],
                        type: 'vec4<f32>'
                    },
                    uColorA: {
                        value: [options.colorA?.r ?? 1, options.colorA?.g ?? 1, options.colorA?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 0, options.colorB?.g ?? 0, options.colorB?.b ?? 0],
                        type: 'vec3<f32>'
                    },
                    uAudioBeat: { value: 0, type: 'f32' }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uTime: number; uParams: Float32Array; uColorA: Float32Array; uColorB: Float32Array; uAudioBeat: number } }
        >).dotsUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set spacing(v: number) { this.u.uParams[0] = v; }
    get spacing(): number { return this.u.uParams[0]; }
    set radius(v: number) { this.u.uParams[1] = v; }
    get radius(): number { return this.u.uParams[1]; }
    set jitter(v: number) { this.u.uParams[2] = v; }
    get jitter(): number { return this.u.uParams[2]; }
    set beatPulseAmount(v: number) { this.u.uParams[3] = v; }
    get beatPulseAmount(): number { return this.u.uParams[3]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
    setAudio(beat: number) {
        this.u.uAudioBeat = beat;
    }
}
