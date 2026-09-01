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

// Note: without raw sample-buffer access (the audio pipeline only exposes
// scalar band levels + beat phase), this can't draw a true oscilloscope
// trace. Instead it composites a few band-driven sine harmonics into a
// wave shape - reads as a live waveform, is real audio-reactive motion.
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform vec4 uInputSize;
uniform float uTime;
uniform vec4 uParams; // x = speed, y = amplitude, z = thickness, w = glow
uniform vec3 uColorLine;
uniform vec3 uColorBg;
uniform vec3 uAudio; // bass, mid, treble

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y);

    float t = uTime * uParams.x;
    float wave = 0.0;
    wave += sin(uv.x * 8.0 + t * 2.0) * uAudio.x;
    wave += sin(uv.x * 16.0 - t * 3.0) * uAudio.y * 0.6;
    wave += sin(uv.x * 32.0 + t * 5.0) * uAudio.z * 0.35;
    wave *= uParams.y;

    float y = 0.5 + wave;
    float d = abs(uv.y - y);
    float line = smoothstep(uParams.z, 0.0, d);
    float glow = smoothstep(uParams.z * uParams.w, 0.0, d) * 0.5;

    vec3 col = mix(uColorBg, uColorLine, clamp(line + glow, 0.0, 1.0));
    finalColor = vec4(col, 1.0);
}
`;

export interface WaveformOptions {
    speed?: number;
    amplitude?: number;
    thickness?: number;
    glow?: number;
    colorLine?: { r: number; g: number; b: number };
    colorBg?: { r: number; g: number; b: number };
}

export class WaveformFilter extends Filter {
    private clock = 0;

    constructor(options: WaveformOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'waveform-filter' });

        super({
            glProgram,
            resources: {
                waveformUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.speed ?? 1, options.amplitude ?? 0.15, options.thickness ?? 0.01, options.glow ?? 4],
                        type: 'vec4<f32>'
                    },
                    uColorLine: {
                        value: [options.colorLine?.r ?? 0.3, options.colorLine?.g ?? 1, options.colorLine?.b ?? 0.8],
                        type: 'vec3<f32>'
                    },
                    uColorBg: {
                        value: [options.colorBg?.r ?? 0, options.colorBg?.g ?? 0, options.colorBg?.b ?? 0],
                        type: 'vec3<f32>'
                    },
                    uAudio: { value: [0, 0, 0], type: 'vec3<f32>' }
                }
            }
        });
    }

    private get u() {
        return (this.resources as never as Record<
            string,
            {
                uniforms: {
                    uTime: number;
                    uParams: Float32Array;
                    uColorLine: Float32Array;
                    uColorBg: Float32Array;
                    uAudio: Float32Array;
                };
            }
        >).waveformUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set speed(v: number) { this.u.uParams[0] = v; }
    get speed(): number { return this.u.uParams[0]; }
    set amplitude(v: number) { this.u.uParams[1] = v; }
    get amplitude(): number { return this.u.uParams[1]; }
    set thickness(v: number) { this.u.uParams[2] = v; }
    get thickness(): number { return this.u.uParams[2]; }
    set glow(v: number) { this.u.uParams[3] = v; }
    get glow(): number { return this.u.uParams[3]; }

    setColorLine(r: number, g: number, b: number) {
        this.u.uColorLine[0] = r; this.u.uColorLine[1] = g; this.u.uColorLine[2] = b;
    }
    setColorBg(r: number, g: number, b: number) {
        this.u.uColorBg[0] = r; this.u.uColorBg[1] = g; this.u.uColorBg[2] = b;
    }
    setAudio(bass: number, mid: number, treble: number) {
        this.u.uAudio[0] = bass; this.u.uAudio[1] = mid; this.u.uAudio[2] = treble;
    }
}
