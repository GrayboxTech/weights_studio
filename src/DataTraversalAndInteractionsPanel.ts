
export class DataTraversalAndInteractionsPanel {
    private sampleSlider: HTMLInputElement | null = null;
    private cellSize: HTMLInputElement | null = null;
    private zoomLevel: HTMLInputElement | null = null;
    private sliderMinLabel: HTMLSpanElement | null = null;
    private sliderMaxLabel: HTMLSpanElement | null = null;
    private sliderTooltip: HTMLSpanElement | null = null;
    private gridToggleButton: HTMLButtonElement | null = null;
    private gridContent: HTMLElement | null = null;

    private startIndexSlider: HTMLInputElement | null = null;
    private startIndexTooltip: HTMLElement | null = null;

    private maxSampleId: number = 60000;
    private totalSamples: number = 60000;
    private currentGridCount: number = 0;
    
    private onControlsChangeCallback: (() => void) | null = null;
    private debounceTimeout: number | null = null;
    private onUpdateCallback: () => void = () => {};

    public onUpdate(callback: () => void) {
        this.onUpdateCallback = callback;
    }

    public initialize(): void {
        this.sampleSlider = document.getElementById('sample-slider') as HTMLInputElement;
        this.cellSize = document.getElementById('cell-size') as HTMLInputElement;
        this.zoomLevel = document.getElementById('zoom-level') as HTMLInputElement;
        this.sliderMinLabel = document.getElementById('slider-min-label') as HTMLSpanElement;
        this.sliderMaxLabel = document.getElementById('slider-max-label') as HTMLSpanElement;
        this.sliderTooltip = document.getElementById('slider-tooltip') as HTMLSpanElement;
        this.gridToggleButton = document.getElementById('grid-toggle') as HTMLButtonElement;
        this.gridContent = document.getElementById('grid-content') as HTMLElement;

        this.startIndexSlider = document.getElementById('start-index-slider') as HTMLInputElement;
        this.startIndexTooltip = document.getElementById('start-index-tooltip') as HTMLElement;

        if (!this.sampleSlider || !this.cellSize || !this.zoomLevel ||
            !this.sliderMinLabel || !this.sliderMaxLabel || !this.sliderTooltip ||
            !this.gridToggleButton || !this.gridContent) {
            console.error('[DataTraversalAndInteractionsPanel] Missing required elements');
            return;
        }

        this.attachEventListeners();
        this.initializeSlider();
    }

    private attachEventListeners(): void {
        if (this.cellSize) {
            this.cellSize.addEventListener('change', () => this.handleControlsChange());
            this.cellSize.addEventListener('input', () => {
                this.onUpdateCallback();
            });
        }
        if (this.zoomLevel) {
            this.zoomLevel.addEventListener('change', () => this.handleControlsChange());
            this.zoomLevel.addEventListener('input', () => {
                this.onUpdateCallback();
            });
        }
        if (this.sampleSlider) {
            this.sampleSlider.addEventListener('input', () => {
                this.updateSliderTooltip();
                this.handleControlsChange();
                this.onUpdateCallback();
            });
        }
        if (this.gridToggleButton) {
            this.gridToggleButton.addEventListener('click', () => this.handleGridToggle());
        }
        if (this.startIndexSlider) {
            this.startIndexSlider.addEventListener('input', () => {
                if (this.startIndexTooltip && this.startIndexSlider) {
                    // Temporarily update tooltip for responsiveness before grid recalculates
                    this.startIndexTooltip.textContent = `Start Index: ${this.startIndexSlider.value}`;
                }
                this.onUpdateCallback();
            });
        }
    }

    private initializeSlider(): void {
        if (!this.sampleSlider || !this.sliderMinLabel || !this.sliderMaxLabel) return;

        this.sampleSlider.min = "0";
        this.sampleSlider.max = this.maxSampleId.toString();
        this.sampleSlider.value = "0";
        this.sampleSlider.step = "1";

        this.sliderMinLabel.textContent = '0';
        this.sliderMaxLabel.textContent = this.maxSampleId.toString();
    }

    private handleControlsChange(): void {
        if (this.debounceTimeout !== null) {
            clearTimeout(this.debounceTimeout);
        }

        this.debounceTimeout = window.setTimeout(() => {
            if (this.onControlsChangeCallback) {
                this.onControlsChangeCallback();
            }
        }, 150);
    }

    private handleGridToggle(): void {
        if (!this.gridToggleButton || !this.gridContent) return;

        const isExpanded = this.gridToggleButton.classList.contains('expanded');
        // console.log('[DataTraversalAndInteractionsPanel] Toggle clicked, current state:', isExpanded ? 'expanded' : 'collapsed');

        if (isExpanded) {
            this.gridToggleButton.classList.remove('expanded');
            this.gridToggleButton.classList.add('collapsed');
            this.gridToggleButton.textContent = '+';
            this.gridContent.style.display = 'none';
        } else {
            this.gridToggleButton.classList.remove('collapsed');
            this.gridToggleButton.classList.add('expanded');
            this.gridToggleButton.textContent = '−';
            this.gridContent.style.display = 'block';
            
            if (this.onControlsChangeCallback) {
                this.onControlsChangeCallback();
            }
        }
    }

    public updateSliderTooltip(): void {
        if (!this.sampleSlider || !this.sliderTooltip) return;

        const value = parseFloat(this.sampleSlider.value);
        const min = parseFloat(this.sampleSlider.min);
        const max = parseFloat(this.sampleSlider.max);
        const gridCount = parseInt(this.sampleSlider.step, 10) || 1;

        const startSampleId = Math.round(value);
        const effectiveGridCount = Math.min(gridCount, this.maxSampleId - startSampleId + 1);
        const endSampleId = Math.min(startSampleId + effectiveGridCount - 1, this.maxSampleId);
        
        this.sliderTooltip.textContent = `${startSampleId} + ${effectiveGridCount} = ${endSampleId + 1}`;

        const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
        this.sliderTooltip.style.left = `calc(${percent}% - ${this.sliderTooltip.offsetWidth / 2}px)`;
    }

    public updateSliderStep(step: number): void {
        if (this.sampleSlider) {
            this.sampleSlider.step = String(step);
        }
    }

    public getStartIndex(): number {
        return this.sampleSlider ? parseInt(this.sampleSlider.value, 10) : 0;
    }

    public getLeftSamples(): number {
        if (!this.sampleSlider) return 0;
        const startSampleId = this.getStartIndex();
        const gridCount = parseInt(this.sampleSlider.step, 10) || 1;
        const effectiveGridCount = Math.min(
            gridCount, this.maxSampleId - startSampleId + 1);
        return Math.max(0, effectiveGridCount);
    }

    public setStartIndex(index: number): void {
        if (this.sampleSlider) {
            this.sampleSlider.value = index.toString();
            // Programmatically trigger the update to refresh data
            if (this.onUpdateCallback) {
                this.onUpdateCallback();
            }
        }
    }

    public setMaxSampleId(maxId: number): void {
        this.maxSampleId = maxId;
        if (this.sampleSlider) {
            this.sampleSlider.max = maxId.toString();
        }
        if (this.sliderMaxLabel) {
            this.sliderMaxLabel.textContent = maxId.toString();
        }
        if (this.startIndexSlider) {
            this.startIndexSlider.max = maxId.toString();
        }
    }

    public getMaxSampleId(): number {
        return this.sampleSlider ? parseInt(this.sampleSlider.max, 10) : 0;
    }

    public setOnControlsChange(callback: () => void): void {
        this.onControlsChangeCallback = callback;
    }

    public setCurrentGridCount(count: number): void {
        this.currentGridCount = count;
    }

    public getImageWidth(): number {
        if (this.cellSize) {
            return parseInt(this.cellSize.value, 10);
        }
        return 128;
    }

    public getMagnification(): number {
        if (this.zoomLevel) {
            return parseInt(this.zoomLevel.value, 10);
        }
        return 1;
    }

    public updateSampleCounts(availableSamples: number, totalSamples: number): void {
        this.maxSampleId = availableSamples;
        this.totalSamples = totalSamples;
        
        if (this.sampleSlider) {
            this.sampleSlider.max = availableSamples.toString();
        }
        
        if (this.sliderMaxLabel) {
            this.sliderMaxLabel.innerHTML = `${availableSamples}<br><small style="font-size: 0.8em; color: #888;">(${totalSamples})</small>`;
        }
        
        if (this.startIndexSlider) {
            this.startIndexSlider.max = availableSamples.toString();
        }
    }
}
