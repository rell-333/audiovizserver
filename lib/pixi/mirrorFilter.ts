import { Filter, GlProgram } from 'pixi.js';

// A straight-line mirror fold.
//
// Kaleido folds angle around a centre point (polar). This folds space
// across a single line through a centre point (linear): pick a side,
// reflect the other side's coordinate onto it. Because the reflection
// is defined purely by the line's normal, "angle" here rotates the
// mirror line itself rather than a wedge — at angle 0 the line is
// vertical (normal points along +x) so the frame splits left/right.

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
uniform vec2 uCentre;   // point the mirror line passes through, in pixels
uniform vec3 uParams;   // x = angle (normal direction, radians), y = mix (0-1), z = flip (0 or 1)

void main(void)
{
    vec2 coord = vTextureCoord * uInputSize.xy;

    vec2 n = vec2(cos(uParams.x), sin(uParams.x));
    vec2 d = coord - uCentre;
    float s = dot(d, n);

    // Flip swaps which side is treated as the "source" half.
    if (uParams.z > 0.5) s = -s;

    vec2 folded = (s < 0.0) ? (coord - 2.0 * s * n) : coord;
    vec2 uv = folded / uInputSize.xy;

    // Reflect out-of-range samples rather than clamp, so a mirror line
    // near an edge doesn't smear into a streak.
    uv = abs(mod(uv, 2.0) - 1.0);

    vec4 mirrored = texture(uTexture, uv);
    vec4 original = texture(uTexture, vTextureCoord);
    finalColor = mix(original, mirrored, uParams.y);
}
`;

export interface MirrorOptions {
    angle?: number;
    centre?: { x: number; y: number };
    mix?: number;
    flip?: boolean;
}

export class MirrorFilter extends Filter {
    constructor(options: MirrorOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'mirror-filter' });

        super({
            glProgram,
            resources: {
                mirrorUniforms: {
                    uCentre: {
                        value: [options.centre?.x ?? 0, options.centre?.y ?? 0],
                        type: 'vec2<f32>'
                    },
                    uParams: {
                        value: [options.angle ?? 0, options.mix ?? 1, options.flip ? 1 : 0],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uCentre: Float32Array; uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uCentre: Float32Array; uParams: Float32Array } }>)
            .mirrorUniforms.uniforms;
    }

    set angle(v: number) {
        this.u.uParams[0] = v;
    }
    get angle(): number {
        return this.u.uParams[0];
    }

    set mix(v: number) {
        this.u.uParams[1] = v;
    }
    get mix(): number {
        return this.u.uParams[1];
    }

    set flip(v: boolean) {
        this.u.uParams[2] = v ? 1 : 0;
    }
    get flip(): boolean {
        return this.u.uParams[2] > 0.5;
    }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x;
        this.u.uCentre[1] = y;
    }
}