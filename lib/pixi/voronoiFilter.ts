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
uniform vec4 uParams; // x = scale, y = speed, z = edgeThickness, w = colorBySite (0/1)
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorEdge;

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

void main(void)
{
    float aspect = uInputSize.x / max(uInputSize.y, 1.0);
    vec2 uv = vec2(vTextureCoord.x * aspect, vTextureCoord.y) * uParams.x;

    vec2 cell = floor(uv);
    vec2 f = fract(uv);

    float minDist = 8.0;
    float secondDist = 8.0;
    vec2 closestSeed = vec2(0.0);

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 seed = hash22(cell + neighbor) * 0.5 + 0.5;
            seed = 0.5 + 0.5 * sin(uTime * uParams.y + 6.2831 * seed);
            vec2 point = neighbor + seed - f;
            float dist = dot(point, point);
            if (dist < minDist) {
                secondDist = minDist;
                minDist = dist;
                closestSeed = cell + neighbor;
            } else if (dist < secondDist) {
                secondDist = dist;
            }
        }
    }

    float edge = smoothstep(0.0, uParams.z, sqrt(secondDist) - sqrt(minDist));
    float siteId = fract(sin(dot(closestSeed, vec2(41.3, 289.1))) * 4321.0);
    vec3 fill = mix(uColorA, uColorB, mix(0.5, siteId, uParams.w));

    finalColor = vec4(mix(uColorEdge, fill, edge), 1.0);
}
`;

export interface VoronoiOptions {
    scale?: number;
    speed?: number;
    edgeThickness?: number;
    colorBySite?: number;
    colorA?: { r: number; g: number; b: number };
    colorB?: { r: number; g: number; b: number };
    colorEdge?: { r: number; g: number; b: number };
}

export class VoronoiFilter extends Filter {
    private clock = 0;

    constructor(options: VoronoiOptions = {}) {
        const glProgram = GlProgram.from({ vertex, fragment, name: 'voronoi-filter' });

        super({
            glProgram,
            resources: {
                voronoiUniforms: {
                    uTime: { value: 0, type: 'f32' },
                    uParams: {
                        value: [options.scale ?? 6, options.speed ?? 0.2, options.edgeThickness ?? 0.08, options.colorBySite ?? 1],
                        type: 'vec4<f32>'
                    },
                    uColorA: {
                        value: [options.colorA?.r ?? 0.1, options.colorA?.g ?? 0.6, options.colorA?.b ?? 1],
                        type: 'vec3<f32>'
                    },
                    uColorB: {
                        value: [options.colorB?.r ?? 1, options.colorB?.g ?? 0.1, options.colorB?.b ?? 0.6],
                        type: 'vec3<f32>'
                    },
                    uColorEdge: {
                        value: [options.colorEdge?.r ?? 0, options.colorEdge?.g ?? 0, options.colorEdge?.b ?? 0],
                        type: 'vec3<f32>'
                    }
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
                    uColorA: Float32Array;
                    uColorB: Float32Array;
                    uColorEdge: Float32Array;
                };
            }
        >).voronoiUniforms.uniforms;
    }

    advance(dt: number) {
        this.clock += dt;
        this.u.uTime = this.clock;
    }

    set scale(v: number) { this.u.uParams[0] = v; }
    get scale(): number { return this.u.uParams[0]; }
    set speed(v: number) { this.u.uParams[1] = v; }
    get speed(): number { return this.u.uParams[1]; }
    set edgeThickness(v: number) { this.u.uParams[2] = v; }
    get edgeThickness(): number { return this.u.uParams[2]; }
    set colorBySite(v: number) { this.u.uParams[3] = v; }
    get colorBySite(): number { return this.u.uParams[3]; }

    setColorA(r: number, g: number, b: number) {
        this.u.uColorA[0] = r; this.u.uColorA[1] = g; this.u.uColorA[2] = b;
    }
    setColorB(r: number, g: number, b: number) {
        this.u.uColorB[0] = r; this.u.uColorB[1] = g; this.u.uColorB[2] = b;
    }
    setColorEdge(r: number, g: number, b: number) {
        this.u.uColorEdge[0] = r; this.u.uColorEdge[1] = g; this.u.uColorEdge[2] = b;
    }
}
