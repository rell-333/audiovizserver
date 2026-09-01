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
uniform float uTime;
uniform vec4 uParams; // x = scale, y = angle, z = softness, w = scroll speed
uniform vec3 uColorA;
uniform vec3 uColorB;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y) - 0.5;

    float c = cos(uParams.y);
    float s = sin(uParams.y);
    vec2 rot = mat2(c, -s, s, c) * uv;

    float band = rot.x * uParams.x + uTime * uParams.w;
    float stripe = 0.5 + 0.5 * sin(band * 6.28318);
    stripe = smoothstep(0.5 - uParams.z, 0.5 + uParams.z, stripe);

    finalColor = vec4(mix(uColorA, uColorB, stripe), 1.0);
}
`;

export interface StripesOptions {
    scale?: number;
    angle?: number;
    softness?: number;
    scrollSpeed?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
}

export class StripesFilter extends Filter {
    private clock = 0;

    constructor(options: StripesOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'stripes-filter' });

        super({
            glProgram,
            resources: {
                stripesUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 6, options.angle ?? 0, options.softness ?? 0.05, options.scrollSpeed ?? 0],
                        type: 'vec4<f32>'
                    },
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
            { uniforms: { uTime: number; uParams: Float32Array; uColorA: Float32Array; uColorB: Float32Array } }
        >).stripesUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set angle(v: number) { this.u.uParams[1] = v; }
    get angle(): number { return this.u.uParams[1]; }
    set softness(v: number) { this.u.uParams[2] = v; }
    get softness(): number { return this.u.uParams[2]; }
    set scrollSpeed(v: number) { this.u.uParams[3] = v; }
    get scrollSpeed(): number { return this.u.uParams[3]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
}
