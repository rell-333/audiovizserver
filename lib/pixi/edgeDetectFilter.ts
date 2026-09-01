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
uniform vec4 uInputSize; // zw = texel size
uniform vec3 uParams;    // x = threshold, y = mix, z = invert (0 or 1)

float luma(vec2 uv)
{
    return dot(texture(uTexture, uv).rgb, vec3(0.299, 0.587, 0.114));
}

void main(void)
{
    vec2 t = uInputSize.zw;

    float tl = luma(vTextureCoord + vec2(-t.x, -t.y));
    float tc = luma(vTextureCoord + vec2(0.0, -t.y));
    float tr = luma(vTextureCoord + vec2(t.x, -t.y));
    float ml = luma(vTextureCoord + vec2(-t.x, 0.0));
    float mr = luma(vTextureCoord + vec2(t.x, 0.0));
    float bl = luma(vTextureCoord + vec2(-t.x, t.y));
    float bc = luma(vTextureCoord + vec2(0.0, t.y));
    float br = luma(vTextureCoord + vec2(t.x, t.y));

    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = sqrt(gx * gx + gy * gy);

    edge = smoothstep(uParams.x - 0.1, uParams.x + 0.1, edge);
    if (uParams.z > 0.5) edge = 1.0 - edge;

    vec4 src = texture(uTexture, vTextureCoord);
    vec3 lineColor = vec3(edge);
    finalColor = vec4(mix(src.rgb, lineColor, uParams.y), src.a);
}
`;

export interface EdgeDetectOptions {
    threshold?: number;
    mix?: number;
    invert?: boolean;
}

export class EdgeDetectFilter extends Filter {
    constructor(options: EdgeDetectOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'edge-detect-filter' });

        super({
            glProgram,
            resources: {
                edgeDetectUniforms: {
                    uParams: {
                        value: [options.threshold ?? 0.3, options.mix ?? 1, options.invert ? 1 : 0],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uParams: Float32Array } {
        return (this.resources as never as Record<string, { uniforms: { uParams: Float32Array } }>)
            .edgeDetectUniforms.uniforms;
    }

    set threshold(v: number) {
        this.u.uParams[0] = v;
    }
    get threshold(): number {
        return this.u.uParams[0];
    }

    set mix(v: number) {
        this.u.uParams[1] = v;
    }
    get mix(): number {
        return this.u.uParams[1];
    }

    set invert(v: boolean) {
        this.u.uParams[2] = v ? 1 : 0;
    }
    get invert(): boolean {
        return this.u.uParams[2] > 0.5;
    }
}
