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
uniform vec4 uInputSize;
uniform vec2 uCentre;  // pixels
uniform vec3 uParams;  // x = radius (0-1 of half-diagonal), y = softness, z = strength
uniform vec3 uTint;    // vignette colour, default black

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);

    vec2 coord = vTextureCoord * uInputSize.xy;
    float maxDist = length(uInputSize.xy) * 0.5;
    float dist = length(coord - uCentre) / max(maxDist, 1.0);

    float edge = clamp(uParams.x, 0.0, 1.0);
    float soft = max(uParams.y, 0.001);
    float vig = 1.0 - smoothstep(edge, edge + soft, dist);

    vec3 shaded = mix(uTint, src.rgb, vig);
    finalColor = vec4(mix(src.rgb, shaded, uParams.z), src.a);
}
`;

export interface VignetteOptions {
    centre?: { x: number; y: number };
    radius?: number;
    softness?: number;
    strength?: number;
    tint?: { r: number; g: number; b: number };
}

export class VignetteFilter extends Filter {
    constructor(options: VignetteOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'vignette-filter' });

        super({
            glProgram,
            resources: {
                vignetteUniforms: {
                    uCentre: {
                        value: [options.centre?.x ?? 0, options.centre?.y ?? 0],
                        type: 'vec2<f32>'
                    },
                    uParams: {
                        value: [options.radius ?? 0.75, options.softness ?? 0.4, options.strength ?? 1],
                        type: 'vec3<f32>'
                    },
                    uTint: {
                        value: [options.tint?.r ?? 0, options.tint?.g ?? 0, options.tint?.b ?? 0],
                        type: 'vec3<f32>'
                    }
                }
            }
        });
    }

    private get u(): { uCentre: Float32Array; uParams: Float32Array; uTint: Float32Array } {
        return (this.resources as never as Record<
            string,
            { uniforms: { uCentre: Float32Array; uParams: Float32Array; uTint: Float32Array } }
        >).vignetteUniforms.uniforms;
    }

    set radius(v: number) {
        this.u.uParams[0] = v;
    }
    get radius(): number {
        return this.u.uParams[0];
    }

    set softness(v: number) {
        this.u.uParams[1] = v;
    }
    get softness(): number {
        return this.u.uParams[1];
    }

    set strength(v: number) {
        this.u.uParams[2] = v;
    }
    get strength(): number {
        return this.u.uParams[2];
    }

    setCentre(x: number, y: number) {
        this.u.uCentre[0] = x;
        this.u.uCentre[1] = y;
    }

    setTint(r: number, g: number, b: number) {
        this.u.uTint[0] = r;
        this.u.uTint[1] = g;
        this.u.uTint[2] = b;
    }
}
