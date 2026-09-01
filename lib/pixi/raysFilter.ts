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
uniform vec4 uParams; // x = rayCount, y = speed, z = sharpness, w = falloff
uniform vec2 uCentre;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAudioTreble;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 p = vTextureCoord - uCentre;
    p.x *= aspect;

    float angle = atan(p.y, p.x) + uTime * uParams.y;
    float ray = 0.5 + 0.5 * sin(angle * uParams.x);
    ray = pow(ray, mix(1.0, 12.0, uParams.z)) * (1.0 + uAudioTreble * 0.8);

    float dist = length(p);
    float fade = pow(clamp(1.0 - dist, 0.0, 1.0), uParams.w);

    vec3 col = mix(uColorB, uColorA, ray * fade);
    finalColor = vec4(col, 1.0);
}
`;

export interface RaysOptions {
    rayCount?: number;
    speed?: number;
    sharpness?: number;
    falloff?: number;
    centre?: { x: number; y: number };
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class RaysFilter extends Filter {
    private clock = 0;

    constructor(options: RaysOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'rays-filter' });

        super({
            glProgram,
            resources: {
                raysUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.rayCount ?? 12, options.speed ?? 0.15, options.sharpness ?? 0.6, options.falloff ?? 1.2],
                        type: 'vec4<f32>'
                    },
                    uCentre: { value: [options.centre?.x ?? 0.5, options.centre?.y ?? 0.5], type: 'vec2<f32>' },
                    uColorA: {
                        value: [options.colorA?.r ?? 1, options.colorA?.g ?? 0.9, options.colorA?.b ?? 0.5],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 0, options.colorB?.g ?? 0, options.colorB?.b ?? 0],
                        type: 'vec3<f32>'
                    },
                    uAudioTreble: { value: 0, type: 'f32' }
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
                    uCentre: Float32Array;
                    uColorA: Float32Array;
                    uColorB: Float32Array;
                    uAudioTreble: number;
                };
            }
        >).raysUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set rayCount(v: number) { this.u.uParams[0] = v; }
    get rayCount(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set sharpness(v: number) { this.u.uParams[2] = v; }
    get sharpness(): number { return this.u.uParams[2]; }
    set falloff(v: number) { this.u.uParams[3] = v; }
    get falloff(): number { return this.u.uParams[3]; }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x; this.u.uCentre[1] = y;
    }
    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
    setAudio(treble: number) {
        this.u.uAudioTreble = treble;
    }
}
