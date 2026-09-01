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

uniform sampler2D uTexture;
uniform vec4 uParams; // x = tilesX, y = tilesY, z = rotation, w = mirror (0 or 1)

void main(void)
{
    vec2 uv = vTextureCoord - 0.5;
    float c = cos(uParams.z);
    float s = sin(uParams.z);
    uv = mat2(c, -s, s, c) * uv + 0.5;

    vec2 t = uv * uParams.xy;
    vec2 i = floor(t);
    vec2 f = fract(t);
    vec2 mirrored = mix(f, 1.0 - f, mod(i, 2.0));
    vec2 tiled = mix(f, mirrored, uParams.w);

    finalColor = texture(uTexture, tiled);
}
`;

export interface TileOptions {
    tilesX?: number;
    tilesY?: number;
    rotation?: number;
    mirror?: boolean;
}

export class TileFilter extends Filter {
    constructor(options: TileOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'tile-filter' });

        super({
            glProgram,
            resources: {
                tileUniforms: {
                    uParams: {
                        value: [options.tilesX ?? 3, options.tilesY ?? 3, options.rotation ?? 0, options.mirror ? 1 : 0],
                        type: 'vec4<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uParams: Float32Array } }>)
            .tileUniforms.uniforms;
    }

    set tilesX(v: number) { this.u.uParams[0] = v; }
    get tilesX(): number { return this.u.uParams[0]; }
    set tilesY(v: number) { this.u.uParams[1] = v; }
    get tilesY(): number { return this.u.uParams[1]; }
    set rotation(v: number) { this.u.uParams[2] = v; }
    get rotation(): number { return this.u.uParams[2]; }
    set mirror(v: boolean) { this.u.uParams[3] = v ? 1 : 0; }
    get mirror(): boolean { return this.u.uParams[3] > 0.5; }
}
