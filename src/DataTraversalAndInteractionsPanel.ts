
export class DataTraversalAndInteractionsPanel {
    private sampleSlider: HTMLInputElement | null = null;
    private cellSize: HTMLInputElement | null = null;
    private zoomLevel: HTMLInputElement | null = null;
    private imageResolutionPercent: HTMLInputElement | null = null;
    private imageResolutionValue: HTMLSpanElement | null = null;
    private sliderTooltip: HTMLSpanElement | null = null;
    private statTotalCount: HTMLSpanElement | null = null;
    private statActiveCount: HTMLSpanElement | null = null;

    private gridToggleButton: HTMLButtonElement | null = null;
    private gridContent: HTMLElement | null = null;

    private startIndexSlider: HTMLInputElement | null = null;
    private startIndexTooltip: HTMLElement | null = null;

    private maxSampleId: number = 60000;
    private totalSamples: number = 60000;
    private currentGridCount: number = 0;

    private onControlsChangeCallback: (() => void) | null = null;
    private debounceTimeout: number | null = null;
    private onUpdateCallback: () => void = () => { };

    public onUpdate(callback: () => void) {
        this.onUpdateCallback = callback;
    }

    public initialize(): void {
        this.sampleSlider = document.getElementById('sample-slider') as HTMLInputElement;
        this.cellSize = document.getElementById('cell-size') as HTMLInputElement;
        this.zoomLevel = document.getElementById('zoom-level') as HTMLInputElement;
        this.imageResolutionPercent = document.getElementById('image-resolution-percent') as HTMLInputElement;
        this.imageResolutionValue = document.getElementById('image-resolution-value') as HTMLSpanElement;
        this.sliderTooltip = document.getElementById('slider-tooltip') as HTMLSpanElement;

        this.statTotalCount = document.getElementById('stat-total-count') as HTMLSpanElement;
        this.statActiveCount = document.getElementById('stat-active-count') as HTMLSpanElement;

        this.gridContent = document.getElementById('grid-content') as HTMLElement;

        this.startIndexSlider = document.getElementById('start-index-slider') as HTMLInputElement;
        this.startIndexTooltip = document.getElementById('start-index-tooltip') as HTMLElement;

        if (!this.sampleSlider || !this.cellSize || !this.zoomLevel ||
            !this.sliderTooltip || !this.gridContent) {
            console.error('[DataTraversalAndInteractionsPanel] Missing required elements');
            return;
        }

        this.attachEventListeners();
        this.initializeSlider();
        this.updateImageResolutionValue();
    }

    private attachEventListeners(): void {
        if (this.cellSize) {
            this.cellSize.addEventListener('input', () => {
                const val = parseInt(this.cellSize!.value, 10);
                if (isNaN(val) || val < 48) {
                    this.cellSize!.classList.add('invalid-input');
                    this.cellSize!.title = "Minimum cell size is 48px";
                } else {
                    this.cellSize!.classList.remove('invalid-input');
                    this.cellSize!.title = "";
                    this.onUpdateCallback();
                }
            });
            this.cellSize.addEventListener('change', () => {
                const val = parseInt(this.cellSize!.value, 10);
                if (!isNaN(val) && val >= 48) {
                    this.handleControlsChange();
                }
            });
        }
        if (this.zoomLevel) {
            this.zoomLevel.addEventListener('input', () => {
                this.onUpdateCallback();
            });
            this.zoomLevel.addEventListener('change', () => this.handleControlsChange());
        }
        if (this.imageResolutionPercent) {
            this.imageResolutionPercent.addEventListener('input', () => {
                this.updateImageResolutionValue();
                this.onUpdateCallback();
            });
            this.imageResolutionPercent.addEventListener('change', () => {
                this.handleControlsChange();
            });
        }
        if (this.sampleSlider) {
            this.sampleSlider.addEventListener('input', () => {
                this.handleControlsChange();
                this.onUpdateCallback();

                // Update tooltip to show range at current slider position
                if (this.sliderTooltip) {
                    const value = parseFloat(this.sampleSlider!.value);
                    const gridCount = parseInt(this.sampleSlider!.step, 10) || 1;

                    const rawIndex = Math.round(value);
                    const batchNumber = Math.floor(rawIndex / gridCount);
                    const startIndex = batchNumber * gridCount;
                    const endIndex = Math.min(startIndex + gridCount - 1, this.maxSampleId);

                    this.sliderTooltip.textContent = `${startIndex}-${endIndex}`;

                    // Position at slider thumb
                    const sliderRect = this.sampleSlider!.getBoundingClientRect();
                    const min = parseFloat(this.sampleSlider!.min);
                    const max = parseFloat(this.sampleSlider!.max);
                    const percent = (value - min) / (max - min);
                    const thumbX = sliderRect.width * percent;

                    this.sliderTooltip.style.left = `${thumbX}px`;
                    this.sliderTooltip.style.transform = 'translateX(-50%)';
                    this.sliderTooltip.style.display = 'block';
                }
            });
        }
        if (this.gridToggleButton) {
            this.gridToggleButton.addEventListener('click', () => this.handleGridToggle());
        }
        if (this.startIndexSlider) {
            this.startIndexSlider.addEventListener('input', () => {
                if (this.startIndexTooltip && this.startIndexSlider) {
                    // Update tooltip to show data range
                    const startIndex = parseInt(this.startIndexSlider.value, 10);
                    const gridCount = parseInt(this.startIndexSlider.step, 10) || 1;
                    const effectiveGridCount = Math.min(gridCount, this.maxSampleId - startIndex + 1);
                    const endIndex = Math.min(startIndex + effectiveGridCount - 1, this.maxSampleId);

                    this.startIndexTooltip.textContent = `${startIndex} - ${endIndex}`;

                    // Position tooltip at slider cursor position
                    const sliderRect = this.startIndexSlider.getBoundingClientRect();
                    const percent = parseFloat(this.startIndexSlider.value) / parseFloat(this.startIndexSlider.max);
                    const tooltipLeft = (sliderRect.width * percent) - (this.startIndexTooltip.offsetWidth / 2);
                    this.startIndexTooltip.style.left = `${tooltipLeft}px`;
                }
                this.onUpdateCallback();
            });
        }

        // Add hover tooltip to slider showing data range at cursor position
        if (this.sampleSlider) {
            const sliderWrapper = this.sampleSlider.parentElement;
            if (sliderWrapper && this.sliderTooltip) {
                sliderWrapper.addEventListener('mouseenter', () => {
                    if (this.sliderTooltip) {
                        this.sliderTooltip.style.display = 'block';
                    }
                });

                sliderWrapper.addEventListener('mouseleave', () => {
                    if (this.sliderTooltip) {
                        this.sliderTooltip.style.display = 'none';
                    }
                });

                sliderWrapper.addEventListener('mousemove', (e: MouseEvent) => {
                    if (!this.sampleSlider || !this.sliderTooltip) return;

                    const sliderRect = this.sampleSlider.getBoundingClientRect();
                    const mouseX = e.clientX - sliderRect.left;
                    const percent = Math.max(0, Math.min(1, mouseX / sliderRect.width));

                    // Calculate data range at this position
                    const min = parseFloat(this.sampleSlider.min);
                    const max = parseFloat(this.sampleSlider.max);
                    const gridCount = parseInt(this.sampleSlider.step, 10) || 1;

                    // Calculate raw position and snap to nearest batch boundary
                    const rawIndex = min + (max - min) * percent;
                    const batchNumber = Math.floor(rawIndex / gridCount);
                    const startIndex = batchNumber * gridCount;

                    const effectiveGridCount = Math.min(gridCount, this.maxSampleId - startIndex + 1);
                    const endIndex = Math.min(startIndex + effectiveGridCount - 1, this.maxSampleId);

                    this.sliderTooltip.textContent = `${startIndex}-${endIndex}`;
                    this.sliderTooltip.style.left = `${mouseX}px`;
                    this.sliderTooltip.style.transform = 'translateX(-50%)';
                });
            }
        }
    }

    private initializeSlider(): void {
        if (!this.sampleSlider) return;

        this.sampleSlider.min = "0";
        this.sampleSlider.max = this.maxSampleId.toString();
        this.sampleSlider.value = "0";
        this.sampleSlider.step = "1";

        // Initial defaults
        if (this.statTotalCount) this.statTotalCount.textContent = this.maxSampleId.toString();
        if (this.statActiveCount) this.statActiveCount.textContent = this.maxSampleId.toString();
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

    public updateRangeLabels(): void {
        // Deprecated: No longer showing start/end range labels
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

            // Update range labels immediately for visual feedback
            this.updateRangeLabels();

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
        // Stats are updated via updateSampleCounts generally, not just setMaxSampleId
        if (this.statTotalCount) {
            this.statTotalCount.textContent = maxId.toString();
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
            const val = parseInt(this.cellSize.value, 10);
            if (isNaN(val) || val < 48) {
                return 48; // Clamp to minimum even if display is invalid
            }
            return val;
        }
        return 128;
    }

    public getMagnification(): number {
        if (this.zoomLevel) {
            return parseInt(this.zoomLevel.value, 10);
        }
        return 1;
    }

    private updateImageResolutionValue(): void {
        if (!this.imageResolutionValue || !this.imageResolutionPercent) return;

        const value = parseInt(this.imageResolutionPercent.value, 10);
        if (value === 0) {
            this.imageResolutionValue.textContent = 'Auto';
            this.imageResolutionValue.style.color = 'var(--accent-color)';
            this.imageResolutionValue.style.opacity = '1';
        } else {
            this.imageResolutionValue.textContent = `${value}%`;
            this.imageResolutionValue.style.color = 'var(--secondary-text-color)';
            this.imageResolutionValue.style.opacity = '1';
        }
    }

    public getImageResolutionPercent(): number {
        if (!this.imageResolutionPercent) return 0;

        const value = parseInt(this.imageResolutionPercent.value, 10);
        // 0 means auto mode (use grid cell size)
        return value;
    }

    public updateSampleCounts(availableSamples: number, totalSamples: number): void {
        this.maxSampleId = availableSamples;
        this.totalSamples = totalSamples; // This is the 'active' count (in loop)

        if (this.sampleSlider) {
            this.sampleSlider.max = availableSamples.toString();
        }


        if (this.startIndexSlider) {
            this.startIndexSlider.max = availableSamples.toString();
        }

        // Update stats breakdown
        if (this.statTotalCount) {
            this.statTotalCount.textContent = availableSamples.toString();
        }
        if (this.statActiveCount) {
            this.statActiveCount.textContent = totalSamples.toString();
        }
    }

    public decrementActiveCount(amount: number): void {
        if (amount <= 0) return;
        this.totalSamples = Math.max(0, this.totalSamples - amount);
        if (this.statActiveCount) {
            this.statActiveCount.textContent = this.totalSamples.toString();
        }
    }

    public incrementActiveCount(amount: number): void {
        if (amount <= 0) return;
        this.totalSamples += amount;
        if (this.statActiveCount) {
            this.statActiveCount.textContent = this.totalSamples.toString();
        }
    }

    public navigateLeft(): void {
        if (!this.sampleSlider) return;
        const gridCount = parseInt(this.sampleSlider.step, 10) || 1;
        const currentIndex = this.getStartIndex();
        const newIndex = Math.max(0, currentIndex - gridCount);
        this.setStartIndex(newIndex);
    }

    public navigateRight(): void {
        if (!this.sampleSlider) return;
        const gridCount = parseInt(this.sampleSlider.step, 10) || 1;
        const currentIndex = this.getStartIndex();
        const maxIndex = Math.max(0, this.maxSampleId - gridCount);
        const newIndex = Math.min(maxIndex, currentIndex + gridCount);
        this.setStartIndex(newIndex);
    }

    public setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            // Don't navigate if user is typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateLeft();
                console.debug('[Keyboard] Navigate left');
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateRight();
                console.debug('[Keyboard] Navigate right');
            }
        });
    }
}
