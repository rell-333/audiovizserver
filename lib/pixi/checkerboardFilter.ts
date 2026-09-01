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
uniform vec2 uParams; // x = scale, y = rotation
uniform vec3 uColorA;
uniform vec3 uColorB;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y) - 0.5;

    float c = cos(uParams.y);
    float s = sin(uParams.y);
    vec2 rot = mat2(c, -s, s, c) * uv;

    vec2 cell = floor(rot * uParams.x);
    float checker = mod(cell.x + cell.y, 2.0);
    finalColor = vec4(mix(uColorA, uColorB, checker), 1.0);
}
`;

export interface CheckerboardOptions {
    scale?: number;
    rotation?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class CheckerboardFilter extends Filter {
    constructor(options: CheckerboardOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'checkerboard-filter' });

        super({
            glProgram,
            resources: {
                checkerUniforms: {
                    uParams: { value: [options.scale ?? 8, options.rotation ?? 0], type: 'vec2<f32>' },
                    uColorA: {
                        value: [options.colorA?.r ?? 1, options.colorA?.g ?? 1, options.colorA?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 0, options.colorB?.g ?? 0, options.colorB?.b ?? 0],
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
        >).checkerUniforms.uniforms;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set rotation(v: number) { this.u.uParams[1] = v; }
    get rotation(): number { return this.u.uParams[1]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
}
