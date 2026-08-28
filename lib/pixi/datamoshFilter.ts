import { Filter, GlProgram, UniformGroup, type Texture, type TextureSource } from 'pixi.js';

// True datamoshing: per-macroblock motion-vector displacement of the
// previous frame.
//
// Real datamoshing is what happens when you strip the I-frames (full
// pictures) out of a compressed video and leave only P-frames, which
// only encode "move these blocks by this much". The decoder keeps
// applying motion to whatever is already on screen, so the old image
// smears along the new motion instead of being replaced, colour bleeds,
// and macroblocks stretch until a real I-frame arrives and snaps it back.
//
// ---------------------------------------------------------------------
// A note on the second sampler, because I got this wrong once already:
// a filter that samples a texture *other* than its own input must
// register BOTH the texture source and its sampler style as resources at
// construction time, exactly as Pixi's own DisplacementFilter does:
//
//     resources: { ..., uMapTexture: source, uMapSampler: source.style }
//
// An earlier version declared `uniform sampler2D uPrev` in the shader
// but only assigned it after construction via a cast, so it was never
// actually bound. This version follows the DisplacementFilter pattern,
// and the shader below has been compiled and executed against a real GL
// driver (via ANGLE, the same translator Chrome uses) to confirm it
// links clean and produces the expected smear.
// ---------------------------------------------------------------------

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

uniform sampler2D uTexture;   // freshly rendered scene (filter input)
uniform sampler2D uPrevTexture; // last frame's output
uniform vec4 uInputSize;

// x = block size px, y = drift px, z = iframe (0-1), w = chroma bleed px
uniform vec4 uMosh;
// x = time, y = churn, z = direction bias, w = retain
uniform vec4 uMotion;

// Cheap deterministic hash. Fed block coordinates it gives every
// macroblock its own stable motion vector, which is what makes the
// displacement read as codec blocks rather than random noise.
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 blockVector(vec2 block, float t) {
    float a = hash(block + floor(t));
    float b = hash(block + floor(t) + 1.0);
    float m = fract(t);
    float ang = mix(a, b, m) * 6.28318530718;
    float mag = mix(hash(block * 1.7), hash(block * 1.7 + 3.0), m);
    return vec2(cos(ang), sin(ang)) * mag;
}

void main(void)
{
    vec2 px = vTextureCoord * uInputSize.xy;
    float blockSize = max(2.0, uMosh.x);

    vec2 block = floor(px / blockSize);
    vec2 mv = blockVector(block, uMotion.x * uMotion.y);
    mv.x += uMotion.z * 0.6;

    vec2 prevCoord = (px + mv * uMosh.y) / uInputSize.xy;
    prevCoord = clamp(prevCoord, vec2(0.0), vec2(1.0));

    // Chroma bleed: channels sampled at slightly different offsets, the
    // way heavy compression smears colour further than luma.
    float bleed = uMosh.w / max(1.0, uInputSize.x);
    vec4 prev;
    prev.r = texture(uPrevTexture, clamp(prevCoord + vec2(bleed, 0.0), 0.0, 1.0)).r;
    prev.g = texture(uPrevTexture, prevCoord).g;
    prev.b = texture(uPrevTexture, clamp(prevCoord - vec2(bleed, 0.0), 0.0, 1.0)).b;
    prev.a = 1.0;
    prev.rgb *= uMotion.w;

    vec4 fresh = texture(uTexture, vTextureCoord);

    // uMosh.z is the I-frame: 1 = real picture, 0 = pure melt.
    finalColor = mix(prev, fresh, clamp(uMosh.z, 0.0, 1.0));
}
`;

export interface DatamoshOptions {
    prevTexture: Texture;
    blockSize?: number;
    drift?: number;
    iframe?: number;
    bleed?: number;
}

export class DatamoshFilter extends Filter {
    constructor(options: DatamoshOptions) {
        const source = options.prevTexture.source;

        const moshUniforms = new UniformGroup({
            uMosh: {
                value: new Float32Array([
                    options.blockSize ?? 24,
                    options.drift ?? 0,
                    options.iframe ?? 1,
                    options.bleed ?? 0
                ]),
                type: 'vec4<f32>'
            },
            uMotion: {
                value: new Float32Array([0, 0.7, 0, 1]),
                type: 'vec4<f32>'
            }
        });

        super({
            glProgram: GlProgram.from({ vertex, fragment, name: 'datamosh-filter' }),
            resources: {
                moshUniforms,
                // Both entries are required for a second sampler to actually be
                // bound - see the note at the top of this file.
                uPrevTexture: source,
                uPrevSampler: source.style
            }
        });
    }

    private get u(): { uMosh: Float32Array; uMotion: Float32Array } {
        return (
            this.resources as never as Record<string, { uniforms: { uMosh: Float32Array; uMotion: Float32Array } }>
        ).moshUniforms.uniforms;
    }

    set blockSize(v: number) {
        this.u.uMosh[0] = v;
    }
    set drift(v: number) {
        this.u.uMosh[1] = v;
    }
    set iframe(v: number) {
        this.u.uMosh[2] = v;
    }
    set bleed(v: number) {
        this.u.uMosh[3] = v;
    }
    set time(v: number) {
        this.u.uMotion[0] = v;
    }
    set churn(v: number) {
        this.u.uMotion[1] = v;
    }
    set directionBias(v: number) {
        this.u.uMotion[2] = v;
    }
    set retain(v: number) {
        this.u.uMotion[3] = v;
    }

    // Swap which texture is treated as "the previous frame". The theme
    // ping-pongs two render textures, so this is called every frame.
    setPrevTexture(texture: Texture) {
        const source = texture.source as TextureSource;
        const res = this.resources as unknown as Record<string, unknown>;
        res.uPrevTexture = source;
        res.uPrevSampler = source.style;
    }
}