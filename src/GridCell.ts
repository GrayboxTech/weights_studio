
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


export class GridCell {
    private element: HTMLElement;
    private img: HTMLImageElement;
    private label: HTMLSpanElement;
    private record: DataRecord | null = null;
    private displayPreferences: DisplayPreferences | null = null;

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

        // Use byte-based images
        const rawData = record.dataStats.find(stat => stat.name === 'raw_data');
        if (rawData && rawData.value && rawData.value.length > 0) {
            const base64 = bytesToBase64(new Uint8Array(rawData.value));
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            this.setImageSrc(dataUrl);
            return;
        }
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
    }

    public getRecord(): DataRecord | null {
        return this.record;
    }
}
