
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
        
        const rawData = record.dataStats.find(stat => stat.name === 'raw_data');
        if (!rawData || !rawData.value || rawData.value.length === 0)
            return;

        const base64 = bytesToBase64(new Uint8Array(rawData.value));
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        this.setImageSrc(dataUrl);
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
