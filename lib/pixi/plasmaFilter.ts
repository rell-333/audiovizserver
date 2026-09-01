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
uniform vec3 uParams; // x = scale, y = speed, z = colorCycle
uniform float uAudioBass;

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y) * uParams.x;
    float t = uTime * uParams.y;

    float v = sin(uv.x + t);
    v += sin((uv.y + t) * 1.3);
    v += sin((uv.x + uv.y + t) * 0.7);
    vec2 c = uv + 0.5 * vec2(sin(t * 0.6), cos(t * 0.4)) * (1.0 + uAudioBass);
    v += sin(length(c) + t * 1.4);
    v *= 0.25;

    float hue = fract(v * uParams.z + t * 0.05);
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    finalColor = vec4(col, 1.0);
}
`;

export interface PlasmaOptions {
    scale?: number;
    speed?: number;
    colorCycle?: number;
}

export class PlasmaFilter extends Filter {
    private clock = 0;

    constructor(options: PlasmaOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'plasma-filter' });

        super({
            glProgram,
            resources: {
                plasmaUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 3, options.speed ?? 0.6, options.colorCycle ?? 1],
                        type: 'vec3<f32>'
                    },
                    uAudioBass: { value: 0, type: 'f32' }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            { uniforms: { uTime: number; uParams: Float32Array; uAudioBass: number } }
        >).plasmaUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set colorCycle(v: number) { this.u.uParams[2] = v; }
    get colorCycle(): number { return this.u.uParams[2]; }

    setAudio(bass: number) {
        this.u.uAudioBass = bass;
    }
}
