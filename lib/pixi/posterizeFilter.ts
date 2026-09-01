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
uniform vec3 uParams; // x = levels, y = mix, z = gamma

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float levels = max(2.0, uParams.x);

    // Gamma-correct the quantization so the bands feel evenly spaced
    // perceptually rather than bunching up in the shadows.
    vec3 g = pow(max(src.rgb, 0.0), vec3(1.0 / max(uParams.z, 0.01)));
    vec3 q = floor(g * levels + 0.5) / levels;
    q = pow(q, vec3(uParams.z));

    finalColor = vec4(mix(src.rgb, q, uParams.y), src.a);
}
`;

export interface PosterizeOptions {
    levels?: number;
    mix?: number;
    gamma?: number;
}

export class PosterizeFilter extends Filter {
    constructor(options: PosterizeOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'posterize-filter' });

        super({
            glProgram,
            resources: {
                posterizeUniforms: {
                    uParams: {
                        value: [options.levels ?? 6, options.mix ?? 1, options.gamma ?? 1],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uParams: Float32Array } }>)
            .posterizeUniforms.uniforms;
    }

    set levels(v: number) {
        this.u.uParams[0] = v;
    }
    get levels(): number {
        return this.u.uParams[0];
    }

    set mix(v: number) {
        this.u.uParams[1] = v;
    }
    get mix(): number {
        return this.u.uParams[1];
    }

    set gamma(v: number) {
        this.u.uParams[2] = v;
    }
    get gamma(): number {
        return this.u.uParams[2];
    }
}
