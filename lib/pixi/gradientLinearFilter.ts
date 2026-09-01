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

uniform vec2 uParams; // x = angle, y = hardness (0 = soft linear, 1 = hard step)
uniform vec3 uColorA;
uniform vec3 uColorB;

void main(void)
{
    vec2 dir = vec2(cos(uParams.x), sin(uParams.x));
    vec2 p = vTextureCoord - 0.5;
    float t = dot(p, dir) + 0.5;
    t = clamp(t, 0.0, 1.0);
    t = mix(t, step(0.5, t), uParams.y);
    finalColor = vec4(mix(uColorA, uColorB, t), 1.0);
}
`;

export interface GradientLinearOptions {
    angle?: number;
    hardness?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class GradientLinearFilter extends Filter {
    constructor(options: GradientLinearOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'gradient-linear-filter' });

        super({
            glProgram,
            resources: {
                gradientUniforms: {
                    uParams: { value: [options.angle ?? 0, options.hardness ?? 0], type: 'vec2<f32>' },
                    uColorA: {
                        value: [options.colorA?.r ?? 0.05, options.colorA?.g ?? 0, options.colorA?.b ?? 0.2],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 1, options.colorB?.g ?? 0.4, options.colorB?.b ?? 0.7],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uParams: Float32Array; uColorA: Float32Array; uColorB: Float32Array } }
        >).gradientUniforms.uniforms;
    }

    set angle(v: number) { this.u.uParams[0] = v; }
    get angle(): number { return this.u.uParams[0]; }
    set hardness(v: number) { this.u.uParams[1] = v; }
    get hardness(): number { return this.u.uParams[1]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
}
