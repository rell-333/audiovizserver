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
uniform vec3 uParams; // x = radius, y = hardness, z = aspect correct (1 or 0)
uniform vec2 uCentre;
uniform vec3 uColorA;
uniform vec3 uColorB;

void main(void)
{
    float aspect = mix(1.0, uInputSize.x / max(uInputSize.y, 1.0), uParams.z);
    vec2 p = vTextureCoord - uCentre;
    p.x *= aspect;

    float t = clamp(length(p) / max(uParams.x, 0.001), 0.0, 1.0);
    t = mix(t, step(0.5, t), uParams.y);
    finalColor = vec4(mix(uColorA, uColorB, t), 1.0);
}
`;

export interface GradientRadialOptions {
    radius?: number;
    hardness?: number;
    aspectCorrect?: boolean;
    centre?: { x: number; y: number };
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class GradientRadialFilter extends Filter {
    constructor(options: GradientRadialOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'gradient-radial-filter' });

        super({
            glProgram,
            resources: {
                gradientUniforms: {
                    uParams: {
                        value: [options.radius ?? 0.6, options.hardness ?? 0, options.aspectCorrect === false ? 0 : 1],
                        type: 'vec3<f32>'
                    },
                    uCentre: { value: [options.centre?.x ?? 0.5, options.centre?.y ?? 0.5], type: 'vec2<f32>' },
                    uColorA: {
                        value: [options.colorA?.r ?? 1, options.colorA?.g ?? 0.9, options.colorA?.b ?? 0.3],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 0.05, options.colorB?.g ?? 0, options.colorB?.b ?? 0.15],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uParams: Float32Array; uCentre: Float32Array; uColorA: Float32Array; uColorB: Float32Array } }
        >).gradientUniforms.uniforms;
    }

    set radius(v: number) { this.u.uParams[0] = v; }
    get radius(): number { return this.u.uParams[0]; }
    set hardness(v: number) { this.u.uParams[1] = v; }
    get hardness(): number { return this.u.uParams[1]; }
    set aspectCorrect(v: boolean) { this.u.uParams[2] = v ? 1 : 0; }
    get aspectCorrect(): boolean { return this.u.uParams[2] > 0.5; }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x; this.u.uCentre[1] = y;
    }
    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
}
