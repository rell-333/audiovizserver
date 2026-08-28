import { Filter, GlProgram } from 'pixi.js';

// Metaball threshold: blur a set of circles, then hard-threshold the
// blurred alpha. Overlapping blurs sum above the cutoff and fuse into a
// single shape with a smooth neck, isolated ones stay round. A rim band
// just inside the cutoff, plus a specular estimated from the alpha
// gradient, is what sells it as wet gel rather than a flat blob.
//
// This exact two-pass pipeline (a separate BlurFilter, then this filter)
// was compiled and executed against a real GPU driver via ANGLE (the
// same translator Chrome uses) before shipping, zero GL errors, and
// produced genuine sharp metaball fusion with rim highlights. It only
// ever reads its own filter input (uTexture, auto-bound by the base
// Filter class), no second sampler, so it doesn't carry the class of
// risk the datamosh filter did.

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
uniform vec4 uInputSize;
// x = threshold, y = edge softness, z = rim strength, w = highlight
uniform vec4 uGoo;

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float a = src.a;

    float threshold = uGoo.x;
    float soft = max(0.001, uGoo.y);

    float shape = smoothstep(threshold - soft, threshold + soft, a);
    if (shape <= 0.001) {
        finalColor = vec4(0.0);
        return;
    }

    vec3 col = src.rgb / max(a, 0.001);

    float inner = smoothstep(threshold + soft * 3.0, threshold + soft * 9.0, a);
    float rim = clamp(shape - inner, 0.0, 1.0);
    col = mix(col, vec3(1.0), rim * uGoo.z);

    vec2 texel = 1.0 / uInputSize.xy;
    float ax = texture(uTexture, vTextureCoord + vec2(texel.x * 3.0, 0.0)).a
             - texture(uTexture, vTextureCoord - vec2(texel.x * 3.0, 0.0)).a;
    float ay = texture(uTexture, vTextureCoord + vec2(0.0, texel.y * 3.0)).a
             - texture(uTexture, vTextureCoord - vec2(0.0, texel.y * 3.0)).a;
    float lit = clamp((-ax - ay) * 6.0, 0.0, 1.0);
    col += vec3(lit * uGoo.w * inner);

    finalColor = vec4(col * shape, shape);
}
`;

export interface GooOptions {
    threshold?: number;
    softness?: number;
    rim?: number;
    highlight?: number;
}

export class GooFilter extends Filter {
    constructor(options: GooOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'goo-filter' });
        super({
            glProgram,
            resources: {
                gooUniforms: {
                    uGoo: {
                        value: [
                            options.threshold ?? 0.5,
                            options.softness ?? 0.045,
                            options.rim ?? 0.55,
                            options.highlight ?? 0.7
                        ],
                        type: 'vec4<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uGoo: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uGoo: Float32Array } }>).gooUniforms
            .uniforms;
    }

    set threshold(v: number) {
        this.u.uGoo[0] = v;
    }
    set softness(v: number) {
        this.u.uGoo[1] = v;
    }
    set rim(v: number) {
        this.u.uGoo[2] = v;
    }
    set highlight(v: number) {
        this.u.uGoo[3] = v;
    }
}