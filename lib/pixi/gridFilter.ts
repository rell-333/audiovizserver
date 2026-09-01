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
uniform vec3 uParams; // x = spacing, y = thickness, z = rotation
uniform vec3 uColorLine;
uniform vec3 uColorBg;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y) - 0.5;

    float c = cos(uParams.z);
    float s = sin(uParams.z);
    vec2 rot = mat2(c, -s, s, c) * uv;

    vec2 g = fract(rot * uParams.x) - 0.5;
    vec2 lineDist = abs(g);
    float thickness = uParams.y * uParams.x;
    float line = 1.0 - smoothstep(thickness, thickness + 0.02, min(lineDist.x, lineDist.y));

    finalColor = vec4(mix(uColorBg, uColorLine, line), 1.0);
}
`;

export interface GridOptions {
    spacing?: number;
    thickness?: number;
    rotation?: number;
    colorLine?: { r: number; g: number; b: number };
    colorBg?: { r: number; g: number; b: number };
}

export class GridFilter extends Filter {
    constructor(options: GridOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'grid-filter' });

        super({
            glProgram,
            resources: {
                gridUniforms: {
                    uParams: {
                        value: [options.spacing ?? 10, options.thickness ?? 0.04, options.rotation ?? 0],
                        type: 'vec3<f32>'
                    },
                    uColorLine: {
                        value: [options.colorLine?.r ?? 1, options.colorLine?.g ?? 1, options.colorLine?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorBg: {
                        value: [options.colorBg?.r ?? 0, options.colorBg?.g ?? 0, options.colorBg?.b ?? 0],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uParams: Float32Array; uColorLine: Float32Array; uColorBg: Float32Array } }
        >).gridUniforms.uniforms;
    }

    set spacing(v: number) { this.u.uParams[0] = v; }
    get spacing(): number { return this.u.uParams[0]; }
    set thickness(v: number) { this.u.uParams[1] = v; }
    get thickness(): number { return this.u.uParams[1]; }
    set rotation(v: number) { this.u.uParams[2] = v; }
    get rotation(): number { return this.u.uParams[2]; }

    setColorLine(r: number, g: number, b: number) {
        this.u.uColorLine[0] = r; this.u.uColorLine[1] = g; this.u.uColorLine[2] = b;
    }
    setColorBg(r: number, g: number, b: number) {
        this.u.uColorBg[0] = r; this.u.uColorBg[1] = g; this.u.uColorBg[2] = b;
    }
}
