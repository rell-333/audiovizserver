import { Filter, GlProgram } from 'pixi.js';

// A true kaleidoscope, done properly as a fragment shader.
//
// The Canvas version had to redraw the whole scene once per mirror
// segment, which capped how many segments were affordable and softened
// the seams. On the GPU it's a coordinate fold: convert each pixel to
// polar space around the centre, wrap the angle into one segment, mirror
// it about the segment's midline, and sample there. Cost is one pass
// regardless of segment count, and the seams are pixel-exact.

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
uniform vec2 uCentre;   // centre of the fold, in pixels
uniform vec3 uParams;   // x = segments, y = rotation, z = mix (0-1)

const float TAU = 6.28318530718;

void main(void)
{
    // Into pixel space, matching how Pixi's own filters map coords.
    vec2 coord = vTextureCoord * uInputSize.xy;

    vec2 d = coord - uCentre;
    float r = length(d);
    float a = atan(d.y, d.x) + uParams.y;

    float seg = TAU / max(1.0, uParams.x);
    // Wrap into a single wedge, then mirror about its midline. The
    // mirror is what makes adjacent wedges meet seamlessly instead of
    // repeating like a pinwheel.
    a = mod(a, seg);
    a = abs(a - seg * 0.5);

    vec2 folded = uCentre + vec2(cos(a), sin(a)) * r;
    vec2 uv = folded / uInputSize.xy;

    // Reflect out-of-range samples back inside rather than clamping,
    // which would smear the edge pixels into long streaks.
    uv = abs(mod(uv, 2.0) - 1.0);

    vec4 mirrored = texture(uTexture, uv);
    vec4 original = texture(uTexture, vTextureCoord);
    finalColor = mix(original, mirrored, uParams.z);
}
`;

export interface KaleidoOptions {
    segments?: number;
    rotation?: number;
    centre?: { x: number; y: number };
    mix?: number;
}

export class KaleidoFilter extends Filter {
    constructor(options: KaleidoOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'kaleido-filter' });

        super({
            glProgram,
            resources: {
                kaleidoUniforms: {
                    uCentre: {
                        value: [options.centre?.x ?? 0, options.centre?.y ?? 0],
                        type: 'vec2<f32>'
                    },
                    uParams: {
                        value: [options.segments ?? 6, options.rotation ?? 0, options.mix ?? 1],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uCentre: Float32Array; uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uCentre: Float32Array; uParams: Float32Array } }>)
            .kaleidoUniforms.uniforms;
    }

    set segments(v: number) {
        this.u.uParams[0] = v;
    }
    get segments(): number {
        return this.u.uParams[0];
    }

    set rotation(v: number) {
        this.u.uParams[1] = v;
    }
    get rotation(): number {
        return this.u.uParams[1];
    }

    set mix(v: number) {
        this.u.uParams[2] = v;
    }
    get mix(): number {
        return this.u.uParams[2];
    }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x;
        this.u.uCentre[1] = y;
    }
}