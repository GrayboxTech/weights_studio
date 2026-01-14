
import { DataRecord } from "./data_service";
import { DisplayPreferences } from "./DataDisplayOptionsPanel";
import { SegmentationRenderer } from "./SegmentationRenderer";


const PLACEHOLDER_IMAGE_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const EVAL_BORDER_COLOR = '#16bb07db'; // Red for eval
const TRAIN_BORDER_COLOR = '#c57a09ff'; // Teal for train

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}


export type ClassPreference = {
    enabled: boolean;
    color: string;
};


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
        this.element.className = 'cell empty';
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

    public getWidth(): number {
        return parseInt(this.element.style.width);
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
        this.element.classList.remove('empty');
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

            // Use thumbnail if available, otherwise fall back to full image
            const imageBytes = rawStat?.thumbnail && rawStat.thumbnail.length > 0
                ? rawStat.thumbnail
                : (rawStat?.value ? new Uint8Array(rawStat.value) : null);

            this.cachedRawBytes = imageBytes;
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

            // 2) Use WebGL Renderer for masks
            const finalUrl = SegmentationRenderer.getInstance().render(
                img,
                gtStat ? { value: gtStat.value, shape: gtStat.shape } : null,
                predStat ? { value: predStat.value, shape: predStat.shape } : null,
                {
                    showRaw,
                    showGt,
                    showPred,
                    showDiff,
                    alpha: 0.45,
                    classPrefs: classPrefs
                }
            );

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

    public updateLabel(): void {
        if (!this.record || !this.displayPreferences) {
            this.label.textContent = '';
            return;
        }
        const parts: string[] = [];

        if (this.displayPreferences['sampleId']) {
            const formatted = this.formatFieldValue(this.record.sampleId);
            parts.push(formatted);
        }

        // Sort stats before displaying (same order as modal)
        const sortedStats = [...this.record.dataStats].sort((a, b) => {
            const getCategory = (statName: string): number => {
                if (statName === 'origin') return 1;
                if (statName === 'task_type') return 2;
                if (statName === 'tags') return 3;
                if (statName === 'num_classes_present') return 10;
                if (statName === 'dominant_class') return 11;
                if (statName === 'dominant_class_ratio') return 12;
                if (statName === 'background_ratio') return 13;
                if (!statName.includes('loss')) return 100;
                if (statName === 'mean_loss') return 1000;
                if (statName === 'median_loss') return 1001;
                if (statName === 'min_loss') return 1002;
                if (statName === 'max_loss') return 1003;
                if (statName === 'std_loss') return 1004;
                if (statName.startsWith('loss_class_')) {
                    const classNum = parseInt(statName.replace('loss_class_', ''));
                    return 2000 + classNum;
                }
                if (statName.includes('loss')) return 1500;
                return 100;
            };

            const catA = getCategory(a.name);
            const catB = getCategory(b.name);
            if (catA !== catB) return catA - catB;
            return a.name.localeCompare(b.name);
        });

        for (const stat of sortedStats) {
            if (stat.name === 'raw_data')
                continue;
            if (!this.displayPreferences[stat.name])
                continue;

            let formatted = ""
            if (stat.name === "tags") {
                // Parse semi-colon separated tags (backend format) and filter out None, empty strings
                const tagValue = stat.valueString || '';
                const cleanTags = Array.from(new Set(tagValue
                    .split(/[;,]/)
                    .map(t => t.trim())
                    .filter(t => t && t !== 'None')));

                if (cleanTags.length > 0) {
                    formatted = cleanTags.join(', '); // Display nicely with commas
                } else {
                    continue; // Skip displaying if no valid tags
                }
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

        const originStat = this.record.dataStats.find(stat => stat.name === 'origin');
        const valLower = originStat?.valueString?.toLowerCase() || '';
        // Looser check: if it contains eval, test, or val (e.g. "val_set", "my_test")
        const isEval = valLower.includes('eval') ||
            valLower.includes('test') ||
            valLower.includes('val');
        const isDiscarded = this.element.classList.contains('discarded');
        const splitColors = this.displayPreferences.splitColors;

        let borderColor = isEval ? EVAL_BORDER_COLOR : TRAIN_BORDER_COLOR;
        if (splitColors?.eval && splitColors?.train) {
            borderColor = isEval ? splitColors.eval : splitColors.train;
        }

        // If discarded, reduce opacity to 40% (60% transparent)
        if (isDiscarded && borderColor) {
            // Convert hex color to rgba with reduced opacity
            if (borderColor.startsWith('#')) {
                // Convert #rrggbb or #rrggbbaa to rgba
                const hex = borderColor.replace('#', '');
                if (hex.length === 8) {
                    // Already has alpha, replace it
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    borderColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
                } else if (hex.length === 6) {
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    borderColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
                }
            }
        }

        this.element.style.border = `3px solid ${borderColor}`;
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
        this.element.classList.add('empty');
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

    public updateStats(newStats: Record<string, any>): void {
        if (!this.record) return;
        for (const [key, value] of Object.entries(newStats)) {
            const stat = this.record.dataStats.find((s: any) => s.name === key);
            if (stat) {
                if (typeof value === 'string') {
                    stat.valueString = value;
                } else if (typeof value === 'number') {
                    stat.value = [value];
                } else if (Array.isArray(value)) {
                    stat.value = value;
                }
            } else {
                this.record.dataStats.push({
                    name: key,
                    type: typeof value === 'string' ? 'string' : 'scalar',
                    shape: [],
                    value: typeof value === 'number' ? [value] : [],
                    valueString: typeof value === 'string' ? value : ''
                });
            }

            // Special handling for deny_listed
            if (key === 'deny_listed') {
                if (value === 1 || value === true) {
                    this.element.classList.add('discarded');
                } else {
                    this.element.classList.remove('discarded');
                }
            }
        }
        this.updateLabel();
    }
}
