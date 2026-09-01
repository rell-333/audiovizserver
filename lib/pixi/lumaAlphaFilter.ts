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

// Rewrites a texture's alpha channel from either its own alpha or its
// luminance (so a plain grayscale generator can drive a mask, not just
// something with real transparency), with invert and a soft threshold.
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uParams; // x = lumaMix (0=use alpha, 1=use luma), y = invert, z = threshold, w = softness

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    float metric = mix(src.a, luma, uParams.x);

    float soft = max(uParams.w, 0.001);
    metric = smoothstep(uParams.z - soft, uParams.z + soft, metric);
    if (uParams.y > 0.5) metric = 1.0 - metric;

    finalColor = vec4(src.rgb, metric);
}
`;

export interface LumaAlphaOptions {
    lumaMix?: number;
    invert?: boolean;
    threshold?: number;
    softness?: number;
}

export class LumaAlphaFilter extends Filter {
    constructor(options: LumaAlphaOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'luma-alpha-filter' });

        super({
            glProgram,
            resources: {
                lumaAlphaUniforms: {
                    uParams: {
                        value: [
                            options.lumaMix ?? 1,
                            options.invert ? 1 : 0,
                            options.threshold ?? 0.5,
                            options.softness ?? 1
                        ],
                        type: 'vec4<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uParams: Float32Array } }>)
            .lumaAlphaUniforms.uniforms;
    }

    set lumaMix(v: number) { this.u.uParams[0] = v; }
    get lumaMix(): number { return this.u.uParams[0]; }
    set invert(v: boolean) { this.u.uParams[1] = v ? 1 : 0; }
    get invert(): boolean { return this.u.uParams[1] > 0.5; }
    set threshold(v: number) { this.u.uParams[2] = v; }
    get threshold(): number { return this.u.uParams[2]; }
    set softness(v: number) { this.u.uParams[3] = v; }
    get softness(): number { return this.u.uParams[3]; }
}
