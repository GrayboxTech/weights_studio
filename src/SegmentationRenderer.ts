
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

    // Per-cell cache to avoid stale GT/Pred data
    private cellRenderCache = new WeakMap<any, {
        imageUrl: string | null;
        gtMaskData: string | null;  // Base64 of actual mask data
        predMaskData: string | null; // Base64 of actual mask data
        optionsHash: string | null;
        outputDataUrl: string | null;
        timestamp: number;
    }>();

    // Simple LRU cache for frequently accessed renders
    private renderResultCache = new Map<string, {dataUrl: string, timestamp: number}>();
    private readonly MAX_CACHE_SIZE = 256;

    private constructor() {
        this.canvas = document.createElement('canvas');
        // Remove preserveDrawingBuffer to save GPU memory - we'll use toDataURL when needed
        const gl = this.canvas.getContext('webgl', {
            preserveDrawingBuffer: false,
            antialias: false, // Disable for pixel-perfect rendering
            powerPreference: 'low-power' // Prefer integrated GPU for low-power rendering
        });
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
            alpha: number,
            classPrefs?: Record<number, ClassPreference>
        },
        cellKey?: any // Optional cell reference for per-cell caching
    ): string {
        // Generate hashes for cache checking - now with actual data verification
        const imageUrl = baseImage.src;
        const gtMaskData = gtMask ? new Uint8Array(gtMask.value) : null;
        const predMaskData = predMask ? new Uint8Array(predMask.value) : null;

        const gtMaskHash = gtMaskData ? this.generateDataHash(gtMaskData) : null;
        const predMaskHash = predMaskData ? this.generateDataHash(predMaskData) : null;

        const optionsHash = JSON.stringify({
            showRaw: options.showRaw,
            showGt: options.showGt,
            showPred: options.showPred,
            showDiff: options.showDiff,
            alpha: options.alpha,
            classPrefs: options.classPrefs
        });

        // Check LRU cache first (global)
        const cacheKey = this.generateCacheKey(imageUrl, gtMaskHash, predMaskHash, optionsHash);
        const cached = this.renderResultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5000) { // 5s validity
            return cached.dataUrl;
        }

        // Check per-cell cache (if provided)
        if (cellKey) {
            const cellCache = this.cellRenderCache.get(cellKey);
            if (cellCache &&
                cellCache.imageUrl === imageUrl &&
                cellCache.gtMaskData === gtMaskHash &&
                cellCache.predMaskData === predMaskHash &&
                cellCache.optionsHash === optionsHash &&
                cellCache.outputDataUrl &&
                Date.now() - cellCache.timestamp < 10000) { // 10s validity
                return cellCache.outputDataUrl;
            }
        }

        const { width, height } = baseImage;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }

        this.gl.viewport(0, 0, width, height);
        this.gl.useProgram(this.program);

        // Upload Base Image
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.image);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, baseImage);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_image'), 0);

        // Upload GT Mask
        if (gtMask) {
            const [h, w] = this.getHW(gtMask.shape);
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.mask);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.ALPHA, w, h, 0, this.gl.ALPHA, this.gl.UNSIGNED_BYTE, new Uint8Array(gtMask.value));
            this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_mask'), 1);
        }

        // Upload Pred Mask
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
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showGt'), options.showGt ? 1 : 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showPred'), options.showPred ? 1 : 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        // Convert to data URL and cache result
        const dataUrl = this.canvas.toDataURL('image/png');

        // Update LRU cache
        this.renderResultCache.set(cacheKey, {dataUrl, timestamp: Date.now()});

        // Prune cache if too large
        if (this.renderResultCache.size > this.MAX_CACHE_SIZE) {
            const firstKey = this.renderResultCache.keys().next().value;
            this.renderResultCache.delete(firstKey);
        }

        // Update per-cell cache
        if (cellKey) {
            this.cellRenderCache.set(cellKey, {
                imageUrl,
                gtMaskData: gtMaskHash,
                predMaskData: predMaskHash,
                optionsHash,
                outputDataUrl: dataUrl,
                timestamp: Date.now()
            });
        }

        return dataUrl;
    }

    // Clear all caches when needed
    public clearCache(): void {
        this.renderResultCache.clear();
    }

    // Render only masks on black background for instant display
    // This shows GT/Pred immediately without waiting for image to load
    public renderMasksOnly(
        gtMask: { value: number[], shape: number[] } | null,
        predMask: { value: number[], shape: number[] } | null,
        options: {
            showGt: boolean,
            showPred: boolean,
            showDiff: boolean,
            alpha: number,
            classPrefs?: Record<number, ClassPreference>
        },
        cellKey?: any
    ): string {
        // Determine size from masks
        let width = 256, height = 256;
        if (gtMask && gtMask.shape.length >= 2) {
            const [h, w] = this.getHW(gtMask.shape);
            width = w;
            height = h;
        } else if (predMask && predMask.shape.length >= 2) {
            const [h, w] = this.getHW(predMask.shape);
            width = w;
            height = h;
        }

        // Quick cache key
        const gtHash = gtMask ? this.generateDataHash(new Uint8Array(gtMask.value)) : null;
        const predHash = predMask ? this.generateDataHash(new Uint8Array(predMask.value)) : null;
        const cacheKey = `masks-only|${gtHash || 'null'}|${predHash || 'null'}|${width}x${height}|${options.showGt}|${options.showPred}|${options.showDiff}|${options.alpha}`;

        const cached = this.renderResultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5000) {
            return cached.dataUrl;
        }

        // Resize canvas if needed
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }

        this.gl.useProgram(this.program);

        // Clear with black background
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Upload GT Mask
        if (gtMask) {
            const [h, w] = this.getHW(gtMask.shape);
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.mask);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.ALPHA, w, h, 0, this.gl.ALPHA, this.gl.UNSIGNED_BYTE, new Uint8Array(gtMask.value));
            this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_mask'), 1);
        }

        // Upload Pred Mask
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

        // Set Uniforms - no raw image in this mode
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_alpha'), options.alpha);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showRaw'), 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_diffMode'), options.showDiff ? 1 : 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showGt'), options.showGt ? 1 : 0);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_showPred'), options.showPred ? 1 : 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        // Convert to data URL and cache
        const dataUrl = this.canvas.toDataURL('image/png');
        this.renderResultCache.set(cacheKey, {dataUrl, timestamp: Date.now()});

        return dataUrl;
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

    // Generate hash of mask data using simple checksum (faster than full hash)
    private generateDataHash(data: Uint8Array): string {
        let hash = 0;
        const step = Math.max(1, Math.floor(data.length / 1000)); // Sample every Nth byte
        for (let i = 0; i < data.length; i += step) {
            hash = ((hash << 5) - hash) + data[i];
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `${hash}:${data.length}`; // Include length to catch size changes
    }

    // Generate render cache key
    private generateCacheKey(
        imageUrl: string,
        gtMaskHash: string | null,
        predMaskHash: string | null,
        optionsHash: string
    ): string {
        return `${imageUrl}|${gtMaskHash || 'null'}|${predMaskHash || 'null'}|${optionsHash}`;
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
        varying vec2 v_texCoord;

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            if (!u_showRaw) {
                baseColor = vec4(0, 0, 0, 1);
            }

            if (u_diffMode) {
                float gtVal = texture2D(u_mask, v_texCoord).a * 255.0;
                float predVal = texture2D(u_predMask, v_texCoord).a * 255.0;

                if (abs(gtVal - predVal) < 0.1) {
                    gl_FragColor = baseColor;
                } else {
                    vec4 overlay = (gtVal > predVal) ? vec4(0.0, 0.0, 1.0, 0.78) : vec4(1.0, 0.0, 0.0, 0.78);
                    gl_FragColor = mix(baseColor, vec4(overlay.rgb, 1.0), overlay.a);
                }
            } else {
                vec4 res = baseColor;
                if (u_showGt) {
                    float gtId = texture2D(u_mask, v_texCoord).a * 255.0;
                    vec4 gtColor = texture2D(u_palette, vec2((gtId + 0.5) / 256.0, 0.5));
                    if (gtColor.a > 0.0) {
                        res = mix(res, vec4(gtColor.rgb, 1.0), u_alpha);
                    }
                }
                if (u_showPred) {
                    float predId = texture2D(u_predMask, v_texCoord).a * 255.0;
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
