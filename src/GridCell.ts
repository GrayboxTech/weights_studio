
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
        
        // Add double-click listener to show enlarged image
        this.element.addEventListener('dblclick', () => this.showEnlargedImage());
    }
    
    private showEnlargedImage(): void {
        if (!this.img.src || this.img.src === PLACEHOLDER_IMAGE_SRC) {
            return;
        }
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '9999';
        
        // Create container for left panel and center content
        const mainContainer = document.createElement('div');
        mainContainer.style.display = 'flex';
        mainContainer.style.gap = '20px';
        mainContainer.style.alignItems = 'stretch';
        
        // Create left metadata panel
        const metadataPanel = document.createElement('div');
        metadataPanel.style.backgroundColor = 'white';
        metadataPanel.style.borderRadius = '4px';
        metadataPanel.style.padding = '16px';
        metadataPanel.style.minWidth = '280px';
        metadataPanel.style.maxHeight = '600px';
        metadataPanel.style.overflowY = 'auto';
        metadataPanel.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        
        // Add metadata content
        if (this.record) {
            const metadataTitle = document.createElement('h3');
            metadataTitle.textContent = 'Image Data';
            metadataTitle.style.marginTop = '0';
            metadataTitle.style.marginBottom = '16px';
            metadataTitle.style.color = '#333';
            metadataPanel.appendChild(metadataTitle);
            
            // Sample ID
            const sampleIdDiv = document.createElement('div');
            sampleIdDiv.style.marginBottom = '12px';
            sampleIdDiv.innerHTML = `<strong>Sample ID:</strong> <span>${this.record.sampleId}</span>`;
            sampleIdDiv.style.color = '#333';
            sampleIdDiv.style.fontSize = '14px';
            metadataPanel.appendChild(sampleIdDiv);
            
            // Process data stats
            for (const stat of this.record.dataStats) {
                if (stat.name === 'raw_data' || stat.name === 'image') {
                    continue; // Skip binary data fields
                }
                
                const statDiv = document.createElement('div');
                statDiv.style.marginBottom = '12px';
                statDiv.style.color = '#333';
                statDiv.style.fontSize = '14px';
                statDiv.style.paddingBottom = '8px';
                statDiv.style.borderBottom = '1px solid #eee';
                
                const label = document.createElement('strong');
                label.textContent = stat.name + ':';
                statDiv.appendChild(label);
                
                const value = document.createElement('div');
                value.style.marginTop = '4px';
                value.style.color = '#666';
                value.style.wordBreak = 'break-word';
                
                if (stat.name === 'tags') {
                    value.textContent = stat.valueString || '(none)';
                } else if (Array.isArray(stat.value)) {
                    value.textContent = stat.value.map(v => 
                        typeof v === 'number' ? (v % 1 !== 0 ? v.toFixed(3) : v) : v
                    ).join(', ');
                } else if (typeof stat.value === 'number') {
                    value.textContent = stat.value % 1 !== 0 ? stat.value.toFixed(3) : stat.value.toString();
                } else if (typeof stat.value === 'boolean') {
                    value.textContent = stat.value ? 'True' : 'False';
                } else {
                    value.textContent = stat.valueString || (stat.value?.toString() || '(none)');
                }
                
                statDiv.appendChild(value);
                metadataPanel.appendChild(statDiv);
            }
        }
        
        // Create container for image and menu
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '20px';
        
        // Create enlarged image with fixed 512x512 size
        const enlargedImg = document.createElement('img');
        enlargedImg.src = this.img.src;
        enlargedImg.style.width = '512px';
        enlargedImg.style.height = '512px';
        enlargedImg.style.objectFit = 'contain';
        enlargedImg.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        enlargedImg.style.borderRadius = '4px';
        
        // Create context menu
        const menuContainer = document.createElement('div');
        menuContainer.style.display = 'flex';
        menuContainer.style.flexDirection = 'column';
        menuContainer.style.gap = '8px';
        menuContainer.style.backgroundColor = 'white';
        menuContainer.style.borderRadius = '4px';
        menuContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        menuContainer.style.minWidth = '200px';
        
        // Menu items matching the right-click context menu
        const menuItems = [
            { label: 'Add Tag', action: 'add-tag' },
            { label: 'Discard', action: 'discard' }
        ];
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.padding = '10px 16px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.borderBottom = '1px solid #eee';
            menuItem.style.color = '#333';
            menuItem.style.fontSize = '14px';
            menuItem.textContent = item.label;
            menuItem.dataset.action = item.action;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = '#f0f0f0';
            });
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'transparent';
            });
            
            menuContainer.appendChild(menuItem);
        });
        
        // Remove last border
        const lastItem = menuContainer.lastElementChild as HTMLElement;
        if (lastItem) {
            lastItem.style.borderBottom = 'none';
        }
        
        container.appendChild(enlargedImg);
        container.appendChild(menuContainer);
        mainContainer.appendChild(metadataPanel);
        mainContainer.appendChild(container);
        modal.appendChild(mainContainer);
        document.body.appendChild(modal);
        
        // Handle menu item clicks
        menuContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.action) {
                const action = target.dataset.action;
                
                // Get origin from record
                const originStat = this.record?.dataStats.find(stat => stat.name === 'origin');
                const origin = originStat?.valueString || '';
                
                // Dispatch custom event that data.ts can handle
                const event = new CustomEvent('modalContextMenuAction', {
                    detail: {
                        action: action,
                        sampleId: this.record?.sampleId,
                        origin: origin
                    }
                });
                document.dispatchEvent(event);
                
                modal.remove();
            }
        });
        
        // Close on click outside menu/image or on modal background
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on Escape key
        const escapeListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeListener);
            }
        };
        document.addEventListener('keydown', escapeListener);
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

        // Render byte-based images
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
