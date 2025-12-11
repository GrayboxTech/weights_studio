
import { DataRecord } from "./data_service";
import { DisplayPreferences } from "./DataDisplayOptionsPanel";


const PLACEHOLDER_IMAGE_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const EVAL_BORDER_COLOR = '#16bb07db'; // Red for eval
const TRAIN_BORDER_COLOR = '#c57a09ff'; // Teal for train

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function drawMaskOnContext(
    ctx: CanvasRenderingContext2D,
    maskStat: any,
    canvasWidth: number,
    canvasHeight: number,
    color: [number, number, number, number]  // RGBA, 0–255
) {
    if (!maskStat || !Array.isArray(maskStat.value) || !Array.isArray(maskStat.shape)) {
        return;
    }

    const maskValues = maskStat.value as number[];
    const shape = maskStat.shape as number[];

    // Accept [H, W] or [1, H, W] or [H, W, 1]
    let maskH: number;
    let maskW: number;
    if (shape.length === 2) {
        maskH = shape[0];
        maskW = shape[1];
    } else if (shape.length === 3) {
        maskH = shape[shape.length - 2];
        maskW = shape[shape.length - 1];
    } else {
        return;
    }

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const scaleY = maskH / canvasHeight;
    const scaleX = maskW / canvasWidth;

    const [rOverlay, gOverlay, bOverlay, aOverlay] = color;
    const alpha = aOverlay / 255;

    for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
            const srcY = Math.floor(y * scaleY);
            const srcX = Math.floor(x * scaleX);
            const maskIdx = srcY * maskW + srcX;

            const v = maskValues[maskIdx] || 0;
            // Simple rule: >0 == foreground
            if (v > 0) {
                const idx = (y * canvasWidth + x) * 4;

                // Alpha blend overlay color with existing pixel
                const rBase = data[idx + 0];
                const gBase = data[idx + 1];
                const bBase = data[idx + 2];

                data[idx + 0] = (1 - alpha) * rBase + alpha * rOverlay;
                data[idx + 1] = (1 - alpha) * gBase + alpha * gOverlay;
                data[idx + 2] = (1 - alpha) * bBase + alpha * bOverlay;
                // leave data[idx + 3] (alpha) unchanged
                data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function drawDiffMaskOnContext(
    ctx: CanvasRenderingContext2D,
    gtStat: any,
    predStat: any,
    canvasWidth: number,
    canvasHeight: number
) {
    if (!gtStat || !predStat) return;
    if (!Array.isArray(gtStat.value) || !Array.isArray(gtStat.shape)) return;
    if (!Array.isArray(predStat.value) || !Array.isArray(predStat.shape)) return;

    const gtValues = gtStat.value as number[];
    const gtShape = gtStat.shape as number[];
    const predValues = predStat.value as number[];
    const predShape = predStat.shape as number[];

    // assume same shape, accept [H,W], [1,H,W], [H,W,1]
    const getHW = (shape: number[]): [number, number] | null => {
        if (shape.length === 2) return [shape[0], shape[1]];
        if (shape.length === 3) return [shape[shape.length - 2], shape[shape.length - 1]];
        return null;
    };

    const gtHW = getHW(gtShape);
    const predHW = getHW(predShape);
    if (!gtHW || !predHW) return;

    const [gtH, gtW] = gtHW;
    const [predH, predW] = predHW;

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const scaleYgt = gtH / canvasHeight;
    const scaleXgt = gtW / canvasWidth;
    const scaleYpred = predH / canvasHeight;
    const scaleXpred = predW / canvasWidth;

    // Colors for errors:
    const fnColor: [number, number, number, number] = [0, 0, 255, 200];   // FN = GT=1, Pred=0 (blue)
    const fpColor: [number, number, number, number] = [255, 0, 0, 200];   // FP = GT=0, Pred=1 (red)

    for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
            const gtY = Math.floor(y * scaleYgt);
            const gtX = Math.floor(x * scaleXgt);
            const predY = Math.floor(y * scaleYpred);
            const predX = Math.floor(x * scaleXpred);

            const gtIdx = gtY * gtW + gtX;
            const predIdx = predY * predW + predX;

            const gtVal = gtValues[gtIdx] || 0;
            const predVal = predValues[predIdx] || 0;

            const gtFg = gtVal > 0;
            const predFg = predVal > 0;

            // Only highlight mismatches
            if (gtFg === predFg) continue;

            const idx = (y * canvasWidth + x) * 4;
            const rBase = data[idx + 0];
            const gBase = data[idx + 1];
            const bBase = data[idx + 2];

            const color = gtFg && !predFg ? fnColor : fpColor;
            const [rOverlay, gOverlay, bOverlay, aOverlay] = color;
            const alpha = aOverlay / 255;

            data[idx + 0] = (1 - alpha) * rBase + alpha * rOverlay;
            data[idx + 1] = (1 - alpha) * gBase + alpha * gOverlay;
            data[idx + 2] = (1 - alpha) * bBase + alpha * bOverlay;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

type ClassPreference = {
    enabled: boolean;
    color: string;
};

function drawMultiClassMaskOnContext(
    ctx: CanvasRenderingContext2D,
    maskStat: any,
    canvasWidth: number,
    canvasHeight: number,
    classPrefs: Record<number, ClassPreference> | undefined,
    alpha: number
) {
    if (!maskStat || !Array.isArray(maskStat.value) || !Array.isArray(maskStat.shape)) {
        return;
    }
    if (!classPrefs) return;

    const values = maskStat.value as number[];
    const shape = maskStat.shape as number[];

    let maskH: number;
    let maskW: number;
    if (shape.length === 2) {
        maskH = shape[0];
        maskW = shape[1];
    } else if (shape.length === 3) {
        maskH = shape[shape.length - 2];
        maskW = shape[shape.length - 1];
    } else {
        return;
    }

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const scaleY = maskH / canvasHeight;
    const scaleX = maskW / canvasWidth;

    for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
            const srcY = Math.floor(y * scaleY);
            const srcX = Math.floor(x * scaleX);
            const idxMask = srcY * maskW + srcX;

            const clsId = values[idxMask] ?? 0;
            const pref = classPrefs[clsId];
            if (!pref || !pref.enabled) continue;
            if (clsId === 0) continue; // ignore background if it exists

            const hex = pref.color.replace('#', '');
            if (hex.length !== 6) continue;

            const rOverlay = parseInt(hex.slice(0, 2), 16);
            const gOverlay = parseInt(hex.slice(2, 4), 16);
            const bOverlay = parseInt(hex.slice(4, 6), 16);

            const idx = (y * canvasWidth + x) * 4;
            const rBase = data[idx + 0];
            const gBase = data[idx + 1];
            const bBase = data[idx + 2];

            data[idx + 0] = (1 - alpha) * rBase + alpha * rOverlay;
            data[idx + 1] = (1 - alpha) * gBase + alpha * gOverlay;
            data[idx + 2] = (1 - alpha) * bBase + alpha * bOverlay;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}


export class GridCell {
    private element: HTMLElement;
    private img: HTMLImageElement;
    private label: HTMLSpanElement;
    private record: DataRecord | null = null;
    private displayPreferences: DisplayPreferences | null = null;

    private taskType: string | null = null;
    private cachedRawBytes: Uint8Array | null = null;
    private cachedRawShape: number[] | null = null;
    private cachedGtStat: any | null = null;
    private cachedPredStat: any | null = null;

    constructor(width: number, height: number) {
        this.element = document.createElement('div');
        this.element.className = 'cell';
        this.element.style.width = `${width}px`;
        this.element.style.height = `${height}px`;

        this.img = document.createElement('img');
        this.img.style.width = '100%';
        this.img.style.height = '100%';
        this.img.style.objectFit = 'contain';

        this.label = document.createElement('span');
        this.label.className = 'cell-label';

        this.element.appendChild(this.img);
        this.element.appendChild(this.label);

        // Store reference for selection.ts to use
        (this.element as any).__gridCell = this;
    }

    getElement(): HTMLElement {
        return this.element;
    }

    setDisplayPreferences(displayPreferences: DisplayPreferences): void {
        this.displayPreferences = displayPreferences;
    }

    private redrawSegmentation(): void {
        if (!this.displayPreferences) return;
        if (!this.cachedRawBytes) return;

        const base64 = bytesToBase64(this.cachedRawBytes);
        const baseImageUrl = `data:image/png;base64,${base64}`;

        const showRaw = this.displayPreferences['showRawImage'] as boolean ?? true;
        const showGt = this.displayPreferences['showGtMask'] as boolean ?? true;
        const showPred = this.displayPreferences['showPredMask'] as boolean ?? true;
        const showDiff = this.displayPreferences['showDiffMask'] as boolean ?? false;

        this.applySegmentationVisualization(
            baseImageUrl,
            this.cachedGtStat,
            this.cachedPredStat,
            showRaw,
            showGt,
            showPred,
            showDiff
        );
    }


    populate(record: DataRecord, displayPreferences: DisplayPreferences): void {
        this.record = record;
        this.displayPreferences = displayPreferences;
        this.updateLabel();
        this.updateBorderColor();

        // Check if the record is discarded
        const isDiscardedStat = record.dataStats.find(stat => stat.name === 'deny_listed');
        if (isDiscardedStat?.value[0] === 1) {
            this.element.classList.add('discarded');
        } else {
            this.element.classList.remove('discarded');
        }

        // --------------------------------------------------------------------
        // SEGMENTATION: raw image + GT + predicted mask overlays
        // --------------------------------------------------------------------
        const taskTypeStat = record.dataStats.find(stat => stat.name === 'task_type');
        const taskType = taskTypeStat?.valueString || '';

        if (taskType === 'segmentation') {
            const rawStat = record.dataStats.find(stat => stat.name === 'raw_data' && stat.type === 'bytes');
            const gtStat = record.dataStats.find(stat => stat.name === 'label' && stat.type === 'array');
            const predStat = record.dataStats.find(stat => stat.name === 'pred_mask' && stat.type === 'array');

            this.cachedRawBytes = rawStat && rawStat.value ? new Uint8Array(rawStat.value) : null;
            this.cachedRawShape = rawStat?.shape || null;
            this.cachedGtStat = gtStat || null;
            this.cachedPredStat = predStat || null;

            if (this.cachedRawBytes) {
                this.redrawSegmentation();
                return; // segmentation path handled
            }
        }

        // Look for the 'image' stat (array type with pixel data)
        const imageStat = record.dataStats.find(stat => stat.name === 'image' && stat.type === 'array');
        if (imageStat && imageStat.shape && imageStat.shape.length >= 2) {
            // Convert the numpy array to a canvas image
            // Shape is likely [28, 28] or [1, 28, 28] or [3, H, W]
            // For MNIST it's usually [28, 28] (grayscale)

            let width = imageStat.shape[imageStat.shape.length - 1];
            let height = imageStat.shape[imageStat.shape.length - 2];
            const pixelData = imageStat.value as number[];

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (ctx && pixelData) {
                const imageData = ctx.createImageData(width, height);
                const data = imageData.data;

                // Handle flattened data. 
                // If shape is [28, 28], length is 784.
                // If shape is [1, 28, 28], length is 784.

                // Determine if it's a grayscale or RGB image
                let isGrayscale = true;
                let channelCount = 1;
                if (imageStat.shape.length === 3) {
                    // Shape is [C, H, W] or [H, W, C]
                    // Assume [C, H, W] for now, common in PyTorch
                    // If C is 3 or 4, it's color
                    if (imageStat.shape[0] === 3 || imageStat.shape[0] === 4) {
                        channelCount = imageStat.shape[0];
                        isGrayscale = false;
                    } else if (imageStat.shape[2] === 3 || imageStat.shape[2] === 4) {
                        // Assume [H, W, C] for TensorFlow/Keras
                        channelCount = imageStat.shape[2];
                        isGrayscale = false;
                        // Need to reorder pixel data if it's [H, W, C] and we process as [C, H, W]
                        // For simplicity, let's assume [C, H, W] or [H, W] for now.
                        // If the image looks wrong, this is the place to check.
                    }
                }

                // Find max value to determine scaling
                let maxValue = 0;
                for (let i = 0; i < pixelData.length; i++) {
                    if (pixelData[i] > maxValue) {
                        maxValue = pixelData[i];
                    }
                }

                const scaleFactor = maxValue > 1.0 ? 1 : 255; // Scale if values are 0-1 floats

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const i = (y * width + x);
                        const dataIdx = i * 4;

                        if (isGrayscale) {
                            let val = pixelData[i] * scaleFactor;
                            data[dataIdx] = val;     // R
                            data[dataIdx + 1] = val; // G
                            data[dataIdx + 2] = val; // B
                            data[dataIdx + 3] = 255; // A
                        } else {
                            // Assuming [C, H, W] format for color images
                            // R = pixelData[0 * H * W + i]
                            // G = pixelData[1 * H * W + i]
                            // B = pixelData[2 * H * W + i]
                            data[dataIdx] = pixelData[0 * width * height + i] * scaleFactor;     // R
                            data[dataIdx + 1] = pixelData[1 * width * height + i] * scaleFactor; // G
                            data[dataIdx + 2] = pixelData[2 * width * height + i] * scaleFactor; // B
                            data[dataIdx + 3] = (channelCount === 4) ? (pixelData[3 * width * height + i] * scaleFactor) : 255; // A
                        }
                    }
                }

                ctx.putImageData(imageData, 0, 0);
                const dataUrl = canvas.toDataURL();
                this.setImageSrc(dataUrl);
                return;
            }
        }

        const rawData = record.dataStats.find(stat => stat.name === 'raw_data');
        if (rawData && rawData.value && rawData.value.length > 0) {
            const base64 = bytesToBase64(new Uint8Array(rawData.value));
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            this.setImageSrc(dataUrl);
            return;
        }
    }

    private applySegmentationVisualization(
        baseImageUrl: string,
        gtStat: any | null,
        predStat: any | null,
        showRaw: boolean,
        showGt: boolean,
        showPred: boolean,
        showDiff: boolean
    ): void {
        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;
            if (!width || !height) {
                this.setImageSrc(baseImageUrl);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                this.setImageSrc(baseImageUrl);
                return;
            }

            // 1) Base: raw image or black
            if (showRaw) {
                ctx.drawImage(img, 0, 0, width, height);
            } else {
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, height);
            }

            const prefs = this.displayPreferences;
            const classPrefs = prefs?.classPreferences as
                | Record<number, ClassPreference>
                | undefined;

            // 2) Diff map, if enabled
            if (showDiff && gtStat && predStat) {
                // You can keep your existing (multi-class) drawDiffMaskOnContext here
                drawDiffMaskOnContext(ctx, gtStat, predStat, width, height);
            } else {
                // 3) GT / Pred overlays with per-class toggles & colors
                if (showGt && gtStat) {
                    drawMultiClassMaskOnContext(ctx, gtStat, width, height, classPrefs, 0.45);
                }
                if (showPred && predStat) {
                    // slightly different alpha to distinguish
                    drawMultiClassMaskOnContext(ctx, predStat, width, height, classPrefs, 0.35);
                }
            }

            const finalUrl = canvas.toDataURL();
            this.setImageSrc(finalUrl);
        };

        img.src = baseImageUrl;
    }



    private formatFieldValue(value: any): string {
        if (Array.isArray(value)) {
            return value.map(item => this.formatFieldValue(item)).join(',');
        }
        if (typeof value === 'number') {
            return value % 1 !== 0 ? value.toFixed(3) : value.toString();
        }
        if (typeof value === 'boolean') {
            return value ? 'T' : 'F';
        }
        return value?.toString() || '';
    }

    private updateLabel(): void {
        if (!this.record || !this.displayPreferences) {
            this.label.textContent = '';
            return;
        }
        const parts: string[] = [];

        if (this.displayPreferences['sampleId']) {
            const formatted = this.formatFieldValue(this.record.sampleId);
            parts.push(formatted);
        }

        for (const stat of this.record.dataStats) {
            if (stat.name === 'raw_data')
                continue;
            if (!this.displayPreferences[stat.name])
                continue;

            let formatted = ""
            if (stat.name === "tags") {
                formatted = this.formatFieldValue(stat.valueString);
            } else {
                formatted = this.formatFieldValue(stat.value);
            }
            parts.push(formatted);

        }
        this.label.textContent = parts.join(' | ');
    }

    private updateBorderColor(): void {
        if (!this.record || !this.displayPreferences) {
            this.element.style.borderColor = '';
            return;
        }

        console.log('Updating border color for sample ID:', this.record.sampleId, this.record);
        const originStat = this.record.dataStats.find(stat => stat.name === 'origin');
        console.log('Origin Stat Value:', originStat);
        const isEval = originStat?.valueString === 'eval';
        const splitColors = this.displayPreferences.splitColors;
        console.log(`Sample ID: ${this.record.sampleId}, Origin Stat:`, originStat, `Is Eval: ${isEval}`, `Split Colors:`, splitColors);

        if (splitColors?.eval && splitColors?.train) {
            this.element.style.border = `3px solid ${isEval ? splitColors.eval : splitColors.train}`;
        } else {
            this.element.style.border = `3px solid ${isEval ? EVAL_BORDER_COLOR : TRAIN_BORDER_COLOR}`;
        }
    }

    getImage(): HTMLImageElement {
        return this.img;
    }

    setImageSrc(src: string): void {
        this.img.src = src || PLACEHOLDER_IMAGE_SRC;
    }

    public clear(): void {
        this.record = null;
        this.displayPreferences = null;
        this.img.src = PLACEHOLDER_IMAGE_SRC;
        this.img.alt = '';
        this.label.textContent = '';
        this.element.style.border = ''; // Reset border
        this.element.classList.remove('discarded');
    }

    public updateDisplay(displayPreferences: DisplayPreferences): void {
        this.displayPreferences = displayPreferences;
        this.updateLabel();
        this.updateBorderColor();

        if (!this.record) return;

        const taskTypeStat = this.record.dataStats.find(stat => stat.name === 'task_type');
        const taskType = taskTypeStat?.valueString || '';

        if (taskType === 'segmentation') {
            const rawStat = this.record.dataStats.find(stat => stat.name === 'raw_data' && stat.type === 'bytes');
            const gtStat = this.record.dataStats.find(stat => stat.name === 'label' && stat.type === 'array');
            const predStat = this.record.dataStats.find(stat => stat.name === 'pred_mask' && stat.type === 'array');

            if (rawStat && rawStat.value && rawStat.shape && (gtStat || predStat)) {
                const base64 = bytesToBase64(new Uint8Array(rawStat.value));
                const dataUrl = `data:image/png;base64,${base64}`;

                const showRaw = displayPreferences.showRawImage ?? true;
                const showGt = displayPreferences.showGtMask ?? true;
                const showPred = displayPreferences.showPredMask ?? true;
                const showDiff = displayPreferences.showDiffMask ?? false;

                this.applySegmentationVisualization(
                    dataUrl,
                    gtStat || null,
                    predStat || null,
                    showRaw,
                    showGt,
                    showPred,
                    showDiff
                );
                return;
            }
        }
    }

    public getRecord(): DataRecord | null {
        return this.record;
    }
}
