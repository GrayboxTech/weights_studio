
export type ClassPreference = {
    enabled: boolean;
    color: string;
};

export class SegmentationRenderer {
    private static instance: SegmentationRenderer;
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;

    private textures: {
        image: WebGLTexture;
        mask: WebGLTexture;
        predMask: WebGLTexture;
        palette: WebGLTexture;
    };

    private constructor() {
        this.canvas = document.createElement('canvas');
        const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL not supported');
        this.gl = gl;

        this.program = this.createProgram(this.VERTEX_SHADER, this.FRAGMENT_SHADER);
        this.textures = {
            image: this.createTexture(),
            mask: this.createTexture(),
            predMask: this.createTexture(),
            palette: this.createTexture(),
        };

        this.initBuffers();
    }

    public static getInstance(): SegmentationRenderer {
        if (!SegmentationRenderer.instance) {
            SegmentationRenderer.instance = new SegmentationRenderer();
        }
        return SegmentationRenderer.instance;
    }

    private createShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            throw new Error('Shader compilation failed');
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string): WebGLProgram {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            throw new Error('Program linking failed');
        }
        return program;
    }

    private createTexture(): WebGLTexture {
        const tex = this.gl.createTexture()!;
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        return tex;
    }

    private initBuffers() {
        const positions = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1,
        ]);
        const texCoords = new Float32Array([
            0, 1, 1, 1, 0, 0,
            0, 0, 1, 1, 1, 0,
        ]);

        const posBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const posLoc = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

        const texBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);

        const texLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(texLoc);
        this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    public render(
        baseImage: HTMLImageElement,
        gtMask: { value: number[], shape: number[] } | null,
        predMask: { value: number[], shape: number[] } | null,
        options: {
            showRaw: boolean,
            showGt: boolean,
            showPred: boolean,
            showDiff: boolean,
            showSplitView: boolean,
            alpha: number,
            classPrefs?: Record<number, ClassPreference>
        }
    ): string {
        const { width, height } = baseImage;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.gl.viewport(0, 0, width, height);
        this.gl.useProgram(this.program);

        // Upload Base Image
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.image);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, baseImage);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_image'), 0);

        // Upload GT Mask (only if available)
        const hasGtMask = gtMask !== null;
        if (gtMask) {
            const [h, w] = this.getHW(gtMask.shape);
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.mask);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.ALPHA, w, h, 0, this.gl.ALPHA, this.gl.UNSIGNED_BYTE, new Uint8Array(gtMask.value));
            this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_mask'), 1);
        }

        // Upload Pred Mask (only if available)
        const hasPredMask = predMask !== null;
        if (predMask) {
            const [h, w] = this.getHW(predMask.shape);
            this.gl.activeTexture(this.gl.TEXTURE2);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.predMask);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.ALPHA, w, h, 0, this.gl.ALPHA, this.gl.UNSIGNED_BYTE, new Uint8Array(predMask.value));
            this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_predMask'), 2);
        }

        // Upload Palette
        const palette = new Uint8Array(256 * 4);
        if (options.classPrefs) {
            for (let i = 0; i < 256; i++) {
                const pref = options.classPrefs[i];
                if (pref && pref.enabled && i !== 0) {
                    const color = this.hexToRgb(pref.color);
                    palette[i * 4 + 0] = color.r;
                    palette[i * 4 + 1] = color.g;
                    palette[i * 4 + 2] = color.b;
                    palette[i * 4 + 3] = 255;
                } else {
                    palette[i * 4 + 3] = 0;
                }
            }
        }
        this.gl.activeTexture(this.gl.TEXTURE3);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.palette);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 256, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, palette);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_palette'), 3);

        // Set Uniforms
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_alpha'), options.alpha);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showRaw'), options.showRaw ? 1 : 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_diffMode'), options.showDiff ? 1 : 0);
        // Only show GT if it's available
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showGt'), (options.showGt && hasGtMask) ? 1 : 0);
        // Only show Pred if it's available
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showPred'), (options.showPred && hasPredMask) ? 1 : 0);
        // Only show Diff if both are available
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_hasBothMasks'), (hasGtMask && hasPredMask) ? 1 : 0);
        // Split Mode
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_splitView'), options.showSplitView ? 1 : 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        // Return Data URL (could optimize further with toBlob if needed)
        return this.canvas.toDataURL();
    }

    private getHW(shape: number[]): [number, number] {
        if (shape.length === 2) return [shape[0], shape[1]];
        return [shape[shape.length - 2], shape[shape.length - 1]];
    }

    private hexToRgb(hex: string) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    private VERTEX_SHADER = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0, 1);
            v_texCoord = a_texCoord;
        }
    `;

    private FRAGMENT_SHADER = `
        precision mediump float;
        uniform sampler2D u_image;
        uniform sampler2D u_mask;
        uniform sampler2D u_predMask;
        uniform sampler2D u_palette;
        uniform float u_alpha;
        uniform bool u_showRaw;
        uniform bool u_showGt;
        uniform bool u_showPred;
        uniform bool u_diffMode;
        uniform bool u_hasBothMasks;
        uniform bool u_splitView;
        varying vec2 v_texCoord;

        void main() {
            vec2 uv = v_texCoord;
            bool localShowGt = u_showGt;
            bool localShowPred = u_showPred;
            bool localDiffMode = u_diffMode;

            if (u_splitView) {
                // Layout: [TL: Raw, TR: GT] / [BL: Diff, BR: Pred]
                // Note: y=0 is visual Top in this setup.
                
                if (uv.y < 0.5) {
                    // Visual Top Row (y in [0.0, 0.5])
                    uv.y = uv.y * 2.0;
                    if (uv.x < 0.5) {
                        // Top-Left: Raw
                        uv.x = uv.x * 2.0;
                        localShowGt = false;
                        localShowPred = false;
                        localDiffMode = false;
                    } else {
                        // Top-Right: GT
                        uv.x = (uv.x - 0.5) * 2.0;
                        localShowGt = true;
                        localShowPred = false;
                        localDiffMode = false;
                    }
                } else {
                    // Visual Bottom Row (y in [0.5, 1.0])
                    uv.y = (uv.y - 0.5) * 2.0;
                    if (uv.x < 0.5) {
                        // Bottom-Left: Diff
                        uv.x = uv.x * 2.0;
                        localShowGt = false;
                        localShowPred = false;
                        localDiffMode = true;
                    } else {
                        // Bottom-Right: Pred
                        uv.x = (uv.x - 0.5) * 2.0;
                        localShowGt = false;
                        localShowPred = true;
                        localDiffMode = false;
                    }
                }
            }

            vec4 baseColor = texture2D(u_image, uv);
            if (!u_showRaw) {
                baseColor = vec4(0, 0, 0, 1);
            }

            if (localDiffMode && u_diffMode && u_hasBothMasks) {
                float gtVal = texture2D(u_mask, uv).a * 255.0;
                float predVal = texture2D(u_predMask, uv).a * 255.0;

                if (abs(gtVal - predVal) < 0.1) {
                    gl_FragColor = baseColor;
                } else {
                    // Mild Orange for one direction, Milder Blue for the other
                    vec4 overlay = (gtVal > predVal) ? vec4(0.1, 0.45, 1.0, 0.65) : vec4(1.0, 0.5, 0.0, 0.65);
                    gl_FragColor = mix(baseColor, vec4(overlay.rgb, 1.0), overlay.a);
                }
            } else {
                vec4 res = baseColor;
                if (localShowGt && u_showGt) {
                    float gtId = texture2D(u_mask, uv).a * 255.0;
                    vec4 gtColor = texture2D(u_palette, vec2((gtId + 0.5) / 256.0, 0.5));
                    if (gtColor.a > 0.0) {
                        res = mix(res, vec4(gtColor.rgb, 1.0), u_alpha);
                    }
                }
                if (localShowPred && u_showPred) {
                    float predId = texture2D(u_predMask, uv).a * 255.0;
                    vec4 predColor = texture2D(u_palette, vec2((predId + 0.5) / 256.0, 0.5));
                    if (predColor.a > 0.0) {
                        res = mix(res, vec4(predColor.rgb, 1.0), u_alpha * 0.8);
                    }
                }
                gl_FragColor = res;
            }
        }
    `;
}
