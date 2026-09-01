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
uniform vec4 uParams; // x = spacing, y = speed, z = thickness, w = beat kick amount
uniform vec2 uCentre;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAudioBeat;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 p = vTextureCoord - uCentre;
    p.x *= aspect;

    float d = length(p) - uTime * uParams.y - uAudioBeat * uParams.w;
    float ring = fract(d * uParams.x);
    float line = smoothstep(uParams.z, 0.0, abs(ring - 0.5) - (0.5 - uParams.z));

    finalColor = vec4(mix(uColorB, uColorA, line), 1.0);
}
`;

export interface RingsOptions {
    spacing?: number;
    speed?: number;
    thickness?: number;
    beatKick?: number;
    centre?: { x: number; y: number };
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class RingsFilter extends Filter {
    private clock = 0;

    constructor(options: RingsOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'rings-filter' });

        super({
            glProgram,
            resources: {
                ringsUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.spacing ?? 8, options.speed ?? 0.1, options.thickness ?? 0.15, options.beatKick ?? 0.2],
                        type: 'vec4<f32>'
                    },
                    uCentre: { value: [options.centre?.x ?? 0.5, options.centre?.y ?? 0.5], type: 'vec2<f32>' },
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
            {
                uniforms: {
                    uTime: number;
                    uParams: Float32Array;
                    uCentre: Float32Array;
                    uColorA: Float32Array;
                    uColorB: Float32Array;
                    uAudioBeat: number;
                };
            }
        >).ringsUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set spacing(v: number) { this.u.uParams[0] = v; }
    get spacing(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set thickness(v: number) { this.u.uParams[2] = v; }
    get thickness(): number { return this.u.uParams[2]; }
    set beatKick(v: number) { this.u.uParams[3] = v; }
    get beatKick(): number { return this.u.uParams[3]; }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x; this.u.uCentre[1] = y;
    }
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
