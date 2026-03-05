/**
 * Aura Dynamic Fluid Simulation
 * High-performance WebGL Shader for background atmospheric effects.
 */

class AuraFluid {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("Canvas with id '" + canvasId + "' not found.");
            return;
        }

        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error("WebGL not supported");
            return;
        }

        // Configuration
        this.config = {
            speed: 0.5,
            viscosity: 0.8,
            primaryColor: [0.1, 0.5, 0.4], // RGB 0-1 (Emerald-ish)
            secondaryColor: [0.05, 0.1, 0.15], // Dark deep base
            active: true
        };

        this.time = 0;
        this.lastFrame = 0;
        this.init();
    }

    init() {
        // Vertex Shader (Full screen quad)
        const vsSource = `
            attribute vec2 position;
            void main() {
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        // Fragment Shader (The Magic)
        const fsSource = `
            precision highp float;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec3 u_primaryColor;
            uniform vec3 u_secondaryColor;
            uniform float u_speed;
            uniform float u_viscosity;

            // Simplex-like noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
                const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
                vec2 i  = floor(v + dot(v, C.yy) );
                vec2 x0 = v -   i + dot(i, C.xx);
                vec2 i1;
                i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                vec4 x12 = x0.xyxy + C.xxzz;
                x12.xy -= i1;
                i = mod289(i);
                vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
                vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                m = m*m ;
                m = m*m ;
                vec3 x = 2.0 * fract(p * C.www) - 1.0;
                vec3 h = abs(x) - 0.5;
                vec3 ox = floor(x + 0.5);
                vec3 a0 = x - ox;
                m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                vec3 g;
                g.x  = a0.x  * x0.x  + h.x  * x0.y;
                g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                return 130.0 * dot(m, g);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                float ratio = u_resolution.x / u_resolution.y;
                uv.x *= ratio;

                float t = u_time * u_speed;
                
                // Layers of noise for fluid motion
                float n1 = snoise(uv * u_viscosity + t * 0.2);
                float n2 = snoise(uv * (u_viscosity * 2.0) - t * 0.1 + n1 * 0.5);
                float n3 = snoise(uv * (u_viscosity * 0.5) + t * 0.05 + n2 * 0.3);

                float combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
                float intensity = smoothstep(-1.0, 1.0, combined);

                vec3 color = mix(u_secondaryColor, u_primaryColor, intensity);
                
                // Add subtle vignetting
                float dist = distance(gl_FragCoord.xy / u_resolution.xy, vec2(0.5));
                color *= smoothstep(1.5, 0.4, dist);

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        this.program = this.createProgram(vsSource, fsSource);
        if (!this.program) return;
        this.gl.useProgram(this.program);

        // Attributes
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, "position");
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        // Uniforms
        this.uTime = this.gl.getUniformLocation(this.program, "u_time");
        this.uResolution = this.gl.getUniformLocation(this.program, "u_resolution");
        this.uPrimaryColor = this.gl.getUniformLocation(this.program, "u_primaryColor");
        this.uSecondaryColor = this.gl.getUniformLocation(this.program, "u_secondaryColor");
        this.uSpeed = this.gl.getUniformLocation(this.program, "u_speed");
        this.uViscosity = this.gl.getUniformLocation(this.program, "u_viscosity");

        window.addEventListener('resize', () => this.resize());
        this.resize();
        requestAnimationFrame((t) => this.render(t));
    }

    createProgram(vsSource, fsSource) {
        const vs = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    render(now) {
        if (!this.config.active) return;

        const delta = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        this.time += delta;

        this.gl.uniform1f(this.uTime, this.time);
        this.gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
        this.gl.uniform3fv(this.uPrimaryColor, this.config.primaryColor);
        this.gl.uniform3fv(this.uSecondaryColor, this.config.secondaryColor);
        this.gl.uniform1f(this.uSpeed, this.config.speed);
        this.gl.uniform1f(this.uViscosity, this.config.viscosity);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        requestAnimationFrame((t) => this.render(t));
    }

    /**
     * Update the fluid parameters based on sentiment.
     * @param {Object} params { sentiment: 'Positive'|'Negative'|'Neutral', intensity: float }
     */
    update(params) {
        const sentiment = params.sentiment;
        const intensity = params.intensity || 1.0;

        // Smooth transition target colors/speeds
        if (sentiment === 'Positive') {
            this.config.primaryColor = [0.1, 0.6, 0.5]; // Emerald
            this.config.speed = 0.8 * intensity;
            this.config.viscosity = 1.2;
        } else if (sentiment === 'Negative') {
            this.config.primaryColor = [0.5, 0.1, 0.2]; // Crimson
            this.config.speed = 0.3 * intensity;
            this.config.viscosity = 0.5; // More viscous/thick
        } else {
            this.config.primaryColor = [0.2, 0.3, 0.6]; // Indigo/Blue
            this.config.speed = 0.4;
            this.config.viscosity = 0.8;
        }
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    window.aura = new AuraFluid('aura-canvas');
});
