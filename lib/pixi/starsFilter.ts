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
uniform vec4 uParams;   // x = scale, y = speed, z = size, w = twinkle
uniform float uDensity; // 0-1, chance a cell has a star
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec2 uAudio;    // x = bass, y = beat pulse

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
    grid.y -= uTime * uParams.y;

    vec2 cell = floor(grid);
    vec2 f = fract(grid);

    float h = hash21(cell);
    float present = step(1.0 - uDensity, h);

    vec2 jitter = vec2(hash21(cell + 3.1), hash21(cell + 7.7));
    float d = length(f - jitter);
    float dot_ = smoothstep(uParams.z, 0.0, d);

    float tw = mix(1.0, 0.5 + 0.5 * sin(uTime * 6.0 + h * 40.0), uParams.w);
    float brightness = dot_ * present * tw * (1.0 + uAudio.y * 1.5);

    vec3 col = mix(uColorB, uColorA, clamp(brightness, 0.0, 1.0));
    finalColor = vec4(col, 1.0);
}
`;

export interface StarsOptions {
    scale?: number;
    speed?: number;
    size?: number;
    twinkle?: number;
    density?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class StarsFilter extends Filter {
    private clock = 0;

    constructor(options: StarsOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'stars-filter' });

        super({
            glProgram,
            resources: {
                starsUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 20, options.speed ?? 0.05, options.size ?? 0.08, options.twinkle ?? 0.6],
                        type: 'vec4<f32>'
                    },
                    uDensity: { value: options.density ?? 0.15, type: 'f32' },
                    uColorA: {
                        value: [options.colorA?.r ?? 1, options.colorA?.g ?? 1, options.colorA?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 0, options.colorB?.g ?? 0, options.colorB?.b ?? 0.05],
                        type: 'vec3<f32>'
                    },
                    uAudio: { value: [0, 0], type: 'vec2<f32>' }
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
                    uDensity: number;
                    uColorA: Float32Array;
                    uColorB: Float32Array;
                    uAudio: Float32Array;
                };
            }
        >).starsUniforms.uniforms;
    }

    advance(dt: number, speed: number) {
        this.clock += dt * speed;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set size(v: number) { this.u.uParams[2] = v; }
    get size(): number { return this.u.uParams[2]; }
    set twinkle(v: number) { this.u.uParams[3] = v; }
    get twinkle(): number { return this.u.uParams[3]; }
    set density(v: number) { this.u.uDensity = v; }
    get density(): number { return this.u.uDensity; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
    setAudio(bass: number, beat: number) {
        this.u.uAudio[0] = bass; this.u.uAudio[1] = beat;
    }
}
