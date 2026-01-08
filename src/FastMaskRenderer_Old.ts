/**
 * Fast Canvas 2D-based mask renderer
 * Replaces WebGL for instant rendering of GT/Pred overlays
 * Much simpler and faster for this use case
 */

export type ClassPreference = {
    enabled: boolean;
    color: string;
};

export class FastMaskRenderer {
    private static instance: FastMaskRenderer;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    
    // Pre-computed color palette for fast lookup
    private colorPalette: Uint32Array = new Uint32Array(256);
    private lastPaletteHash: string = '';

    private constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 256;
        const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) throw new Error('Canvas 2D not supported');
        this.ctx = ctx;
    }

    public static getInstance(): FastMaskRenderer {
        if (!FastMaskRenderer.instance) {
            FastMaskRenderer.instance = new FastMaskRenderer();
        }
        return FastMaskRenderer.instance;
    }

    private hexToRgba(hex: string, alpha: number = 255): number {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r << 24) | (g << 16) | (b << 8) | alpha;
    }

    private updatePalette(classPrefs: Record<number, ClassPreference> | undefined, alpha: number): void {
        if (!classPrefs) return;

        const hash = JSON.stringify(classPrefs);
        if (this.lastPaletteHash === hash) return; // Already computed

        this.lastPaletteHash = hash;

        for (let i = 0; i < 256; i++) {
            const pref = classPrefs[i];
            if (pref && pref.enabled && i !== 0) {
                const color = pref.color;
                this.colorPalette[i] = this.hexToRgba(color, 255); // Store full alpha, apply blending later
            } else {
                this.colorPalette[i] = 0; // Transparent
            }
        }
    }

    /**
     * Render masks on a black background - INSTANT
     */
    public renderMasksOnly(
        gtMask: { value: number[], shape: number[] } | null,
        predMask: { value: number[], shape: number[] } | null,
        options: {
            showGt: boolean,
            showPred: boolean,
            showDiff: boolean,
            alpha: number,
            classPrefs?: Record<number, ClassPreference>
        }
    ): string {
        // Determine size from masks
        let width = 256, height = 256;
        if (gtMask && gtMask.shape && gtMask.shape.length >= 2) {
            height = gtMask.shape[gtMask.shape.length - 2];
            width = gtMask.shape[gtMask.shape.length - 1];
        } else if (predMask && predMask.shape && predMask.shape.length >= 2) {
            height = predMask.shape[predMask.shape.length - 2];
            width = predMask.shape[predMask.shape.length - 1];
        }

        // Resize canvas if needed
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // Clear with black
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, width, height);

        // Update palette (hash changes only on color changes, not on alpha)
        this.updatePalette(options.classPrefs, 0);

        // Draw GT mask
        if (options.showGt && gtMask) {
            this.drawMaskLayer(new Uint8Array(gtMask.value), gtMask.shape, 256, 256, this.colorPalette, options.alpha, 1.0);
        }

        // Draw Pred mask with lower opacity
        if (options.showPred && predMask) {
            this.drawMaskLayer(new Uint8Array(predMask.value), predMask.shape, 256, 256, this.colorPalette, options.alpha, 0.8);
        }

        // Return as data URL
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Composite image with GT and Pred masks - INSTANT
     */
    public renderComposite(
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
        }
    ): string {
        const width = baseImage.width;
        const height = baseImage.height;

        // Resize canvas
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // Draw base image
        if (options.showRaw) {
            this.ctx.drawImage(baseImage, 0, 0, width, height);
        } else {
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, width, height);
        }

        // Update palette (hash changes only on color changes, not on alpha)
        this.updatePalette(options.classPrefs, 0);

        // Draw GT mask
        if (options.showGt && gtMask) {
            this.drawMaskLayer(new Uint8Array(gtMask.value), gtMask.shape, width, height, this.colorPalette, options.alpha, 1.0);
        }

        // Overlay Pred mask
        if (options.showPred && predMask) {
            this.drawMaskLayer(new Uint8Array(predMask.value), predMask.shape, width, height, this.colorPalette, options.alpha, 0.8);
        }

        return this.canvas.toDataURL('image/png');
    }

    /**
     * Fast mask layer drawing using ImageData for direct pixel manipulation
     */
    private drawMaskLayer(
        maskData: Uint8Array,
        maskShape: number[],
        canvasWidth: number,
        canvasHeight: number,
        palette: Uint32Array,
        globalAlpha: number,
        layerOpacity: number
    ): void {
        const imageData = this.ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;

        // Extract actual mask dimensions
        const maskHeight = maskShape[maskShape.length - 2];
        const maskWidth = maskShape[maskShape.length - 1];

        // If mask size doesn't match canvas, scale/map it
        const scaleX = canvasWidth / maskWidth;
        const scaleY = canvasHeight / maskHeight;

        // Direct pixel manipulation - fastest possible
        for (let y = 0; y < maskHeight; y++) {
            for (let x = 0; x < maskWidth; x++) {
                const maskIdx = y * maskWidth + x;
                const classId = maskData[maskIdx];
                
                if (classId === 0) continue; // Skip background

                const color = palette[classId];
                if (!color) continue; // Skip if no color assigned

                // Extract RGBA from palette (format: RRGGBBAA)
                const r = (color >> 24) & 255;
                const g = (color >> 16) & 255;
                const b = (color >> 8) & 255;

                // Compute final alpha: color alpha * global alpha * layer opacity
                const colorAlpha = (color & 255) / 255; // Normalize to 0-1
                const finalAlpha = colorAlpha * globalAlpha * layerOpacity;

                // If mask is smaller than canvas, fill scaled region
                const startX = Math.floor(x * scaleX);
                const endX = Math.floor((x + 1) * scaleX);
                const startY = Math.floor(y * scaleY);
                const endY = Math.floor((y + 1) * scaleY);

                for (let py = startY; py < endY && py < canvasHeight; py++) {
                    for (let px = startX; px < endX && px < canvasWidth; px++) {
                        const pixelIdx = (py * canvasWidth + px) * 4;

                        // Alpha blending: dst = dst * (1 - alpha) + src * alpha
                        data[pixelIdx] = Math.round(data[pixelIdx] * (1 - finalAlpha) + r * finalAlpha);
                        data[pixelIdx + 1] = Math.round(data[pixelIdx + 1] * (1 - finalAlpha) + g * finalAlpha);
                        data[pixelIdx + 2] = Math.round(data[pixelIdx + 2] * (1 - finalAlpha) + b * finalAlpha);
                        // Keep alpha channel as is (255)
                        data[pixelIdx + 3] = 255;
                    }
                }
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }
}
