import { DataRecord } from "./data_service";

export type SplitColors = {
    [key: string]: string;
};

type ClassPreference = {
    enabled: boolean;
    color: string;
};

export type DisplayPreferences = {
    [key: string]: any; // Allow indexing
    splitColors?: SplitColors;

    showRawImage?: boolean;
    showGtMask?: boolean;
    showPredMask?: boolean;
    showDiffMask?: boolean;

    classPreferences?: Record<number, ClassPreference>;
};

const SEGMENTATION_HIDDEN_FIELDS = new Set([
    "prediction_raw",
    "pred_mask",
    "num_classes",
    "task_type",
    "raw_data",
    "label",
    "showRawImage",
    "showGtMask",
    "showPredMask",
    "showDiffMask",
]);

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;

    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const toHex = (x: number) => {
        const v = Math.round(255 * x).toString(16).padStart(2, "0");
        return v;
    };

    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export class DataDisplayOptionsPanel {
    private element: HTMLElement;
    private checkboxes: Map<string, HTMLInputElement> = new Map();
    private fieldTypes: Map<string, string> = new Map();
    private availableStats: string[] = [];
    private updateCallback: (() => void) | null = null;
    private classIds: number[] = [];
    private isSegmentationDataset = false;

    private updateOverlayToggleAvailability(hasGtMask: boolean, hasPredMask: boolean): void {
        const toggleGt = document.getElementById('toggle-gt') as HTMLInputElement | null;
        const togglePred = document.getElementById('toggle-pred') as HTMLInputElement | null;
        const toggleDiff = document.getElementById('toggle-diff') as HTMLInputElement | null;

        const isSegmentation = this.isSegmentationDataset;

        const gtDisabled = !isSegmentation || !hasGtMask;
        const predDisabled = !isSegmentation || !hasPredMask;
        const diffDisabled = !isSegmentation || !hasGtMask || !hasPredMask;

        const applyState = (el: HTMLInputElement | null, disabled: boolean, reason: string) => {
            if (!el) return;
            el.disabled = disabled;
            if (disabled) {
                el.checked = false;
            }
            const label = el.closest('label');
            if (label) {
                label.classList.toggle('disabled', disabled);
                if (disabled) {
                    label.setAttribute('title', reason);
                } else {
                    label.removeAttribute('title');
                }
            }
        };

        const segmentationMsg = 'Disabled: no segmentation data for this batch.';
        const gtMsg = !isSegmentation ? segmentationMsg : 'Disabled: no ground-truth mask present.';
        const predMsg = !isSegmentation ? segmentationMsg : 'Disabled: no prediction mask present.';
        const diffMsg = !isSegmentation ? segmentationMsg : 'Disabled: need both ground-truth and prediction masks.';

        applyState(toggleGt, gtDisabled, gtMsg);
        applyState(togglePred, predDisabled, predMsg);
        applyState(toggleDiff, diffDisabled, diffMsg);

        // Auto-toggle GT if available
        if (toggleGt && !toggleGt.disabled && hasGtMask) {
            toggleGt.checked = true;
        }

        // Auto-toggle Pred if available
        if (togglePred && !togglePred.disabled && hasPredMask) {
            togglePred.checked = true;
        }

        // Note: Diff is NOT auto-toggled (user must explicitly enable it)

        // Trigger update callback if any toggles changed state
        this.updateCallback?.();
    }

    constructor(container: HTMLElement) {
        this.element = container;
        this.setupControlListeners();
    }

    getElement(): HTMLElement {
        return this.element;
    }

    onUpdate(callback: () => void): void {
        this.updateCallback = callback;
        this.element.addEventListener("preferencesChange", () => callback());
    }

    private updateGlobalModeFlags(): void {
        document.body.classList.toggle("segmentation-mode", this.isSegmentationDataset);
        document.body.classList.toggle("classification-mode", !this.isSegmentationDataset);

        // Hide all segmentation-specific groups (Classes, Overlays toggles, and section title)
        const segmentationGroups = document.querySelectorAll(
            '[data-section="segmentation"]'
        ) as NodeListOf<HTMLElement>;
        segmentationGroups.forEach(group => {
            group.style.display = this.isSegmentationDataset ? "block" : "none";
        });
    }

    private detectSegmentation(records: DataRecord[]): boolean {
        for (const record of records) {
            const stats = record.dataStats || [];
            const taskTypeStat = stats.find((s: any) => s.name === "task_type");
            if (taskTypeStat?.valueString === "segmentation") return true;
            if (taskTypeStat?.valueString === "classification") return false;
        }

        const firstRecord = records[0];
        if (!firstRecord) return false;

        const stats = firstRecord.dataStats || [];
        const hasPredMask = stats.some((s: any) => s.name === "pred_mask");
        const hasNumClasses = stats.some((s: any) => s.name === "num_classes");
        const hasLabelArray = stats.some((s: any) => s.name === "label" && s.type === "array");

        return hasPredMask || hasNumClasses || hasLabelArray;
    }

    populateOptions(dataRecords: DataRecord[]): void {
        if (!dataRecords || dataRecords.length === 0) {
            return;
        }

        // Determine availability of segmentation artifacts across provided records
        let hasGtMask = false;
        let hasPredMask = false;

        dataRecords.forEach(record => {
            if (record.dataStats) {
                for (const stat of record.dataStats) {
                    if (stat.name === "label") {
                        hasGtMask = true;
                    }
                    if (stat.name === "pred_mask") {
                        hasPredMask = true;
                    }
                }
            }
        });

        const currentPrefs = this.getDisplayPreferences();
        const availableFields = new Set<string>();

        // 0) Detect mode (check all records in batch for better detection)
        this.isSegmentationDataset = this.detectSegmentation(dataRecords);
        // Always update visibility to ensure correct state on every data load
        this.updateGlobalModeFlags();

        // 1) Collect all fields seen across all provided records
        this.fieldTypes.clear();

        availableFields.add("sampleId");
        this.fieldTypes.set("sampleId", "string");

        availableFields.add("tags");
        this.fieldTypes.set("tags", "array");

        dataRecords.forEach(record => {
            if (record.dataStats) {
                record.dataStats.forEach((stat: any) => {
                    if (stat.name === "raw_data" ||
                        stat.name === "pred_mask" ||
                        stat.name === "label" ||
                        stat.name === "task_type" ||
                        /^class(_\d+)?$/i.test(stat.name) ||
                        (this.isSegmentationDataset && SEGMENTATION_HIDDEN_FIELDS.has(stat.name))) {
                        return;
                    }
                    availableFields.add(stat.name);
                    this.fieldTypes.set(stat.name, stat.type);
                });
            }
        });
        const hasMeaningful: Record<string, boolean> = {};

        const isMeaningful = (stat: any): boolean => {
            if (!stat) return false;
            if (typeof stat.valueString === 'string') {
                const s = stat.valueString.trim().toLowerCase();
                if (s && s !== 'none' && s !== 'nan') return true;
            }
            if (Array.isArray(stat.value) && stat.value.length > 0) {
                for (const v of stat.value) {
                    if (typeof v === 'number') {
                        if (!Number.isNaN(v)) return true;
                    } else if (v !== null && v !== undefined && String(v).trim() !== '') {
                        return true;
                    }
                }
            }
            return false;
        };

        dataRecords.forEach(record => {
            if (!record.dataStats) return;
            record.dataStats.forEach((stat: any) => {
                const name = stat.name;
                if (name === "raw_data" ||
                    name === "pred_mask" ||
                    name === "task_type" ||
                    /^class(_\d+)?$/i.test(name) ||
                    (name === "label" && this.isSegmentationDataset && SEGMENTATION_HIDDEN_FIELDS.has(name)) ||
                    (this.isSegmentationDataset && SEGMENTATION_HIDDEN_FIELDS.has(name))
                ) {
                    return;
                }
                if (isMeaningful(stat)) {
                    hasMeaningful[name] = true;
                }
            });
        });

        // Add only meaningful fields for this batch
        Object.keys(hasMeaningful).forEach(k => availableFields.add(k));

        // Determine if we actually have new fields to show
        const existingFields = new Set(this.checkboxes.keys());
        let hasNewFields = false;
        for (const field of availableFields) {
            if (!existingFields.has(field)) {
                hasNewFields = true;
                break;
            }
        }

        if (!hasNewFields && this.element.children.length > 0) {
            this.updateOverlayToggleAvailability(hasGtMask, hasPredMask);
            return;
        }

        // 2) rebuild details list while preserving checkbox states
        this.element.innerHTML = "";
        this.checkboxes.clear();

        const defaultCheckedFields = new Set([
            "sampleId"
        ]);

        // Restore user preferences
        for (const field of Array.from(availableFields)) {
            if (currentPrefs[field] === true) {
                defaultCheckedFields.add(field);
            } else if (currentPrefs[field] === false) {
                defaultCheckedFields.delete(field);
            }
        }

        // Update overlay toggle availability after rebuilding the panel
        this.updateOverlayToggleAvailability(hasGtMask, hasPredMask);

        // Sort fields for better organization (same order as modal)
        const sortedFields = Array.from(availableFields).sort((a, b) => {
            const getCategory = (fieldName: string): number => {
                // 1. General info (top)
                if (fieldName === 'sampleId') return 0;  // Always first
                if (fieldName === 'origin') return 1;
                if (fieldName === 'task_type') return 2;
                if (fieldName === 'tags') return 3;

                // 2. Class distribution stats
                if (fieldName === 'num_classes_present') return 10;
                if (fieldName === 'dominant_class') return 11;
                if (fieldName === 'dominant_class_ratio') return 12;
                if (fieldName === 'background_ratio') return 13;

                // 3. Other stats (alphabetically) - skip loss-related
                if (!fieldName.toLowerCase().includes('loss')) {
                    return 100;
                }

                // 4. Aggregate loss stats (bottom, for closer inspection)
                if (fieldName === 'mean_loss') return 1000;
                if (fieldName === 'median_loss') return 1001;
                if (fieldName === 'min_loss') return 1002;
                if (fieldName === 'max_loss') return 1003;
                if (fieldName === 'std_loss') return 1004;

                // 5. Per-class losses (loss_class_0, loss_class_1, etc.) - very bottom
                if (fieldName.startsWith('loss_class_')) {
                    const classNum = parseInt(fieldName.replace('loss_class_', ''));
                    return 2000 + classNum;
                }

                // 6. Any other loss-related stats
                if (fieldName.toLowerCase().includes('loss')) {
                    return 1500;
                }

                return 100;
            };

            const catA = getCategory(a);
            const catB = getCategory(b);
            if (catA !== catB) return catA - catB;
            return a.localeCompare(b);
        });

        sortedFields.forEach(fieldName => {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `display-${fieldName}`;
            checkbox.value = fieldName;

            checkbox.checked = defaultCheckedFields.has(fieldName);

            const labelSpan = document.createElement("span");
            labelSpan.className = "sortable-label";
            labelSpan.textContent = this.formatFieldName(fieldName);
            labelSpan.style.cursor = "pointer";
            labelSpan.style.flexGrow = "1"; // Fill space
            labelSpan.style.marginLeft = "8px"; // Gap
            labelSpan.title = "Click to sort";
            labelSpan.style.userSelect = "none";

            // NOTE: sort indicators are now handled by updateSortUI via chips and badges

            labelSpan.addEventListener('click', (e) => {
                e.preventDefault();
                // If the user clicks the label, they intend to sort, not toggle visibility
                this.handleSort(fieldName);
            });

            const wrapper = document.createElement("div");
            wrapper.className = "checkbox-wrapper";
            // Ensure wrapper is flex for alignment
            wrapper.style.display = "flex";
            wrapper.style.alignItems = "center";
            wrapper.style.padding = "2px 0";

            wrapper.appendChild(checkbox);
            wrapper.appendChild(labelSpan);

            this.element.appendChild(wrapper);
            this.checkboxes.set(fieldName, checkbox);

            checkbox.addEventListener("change", () => {
                this.updateCallback?.();
            });
        });

        if (!this.isSegmentationDataset) {
            this.classIds = [];
            this.updateCallback?.();
            return;
        }

        // 3) segmentation class IDs
        let classIds: number[] = [];
        const firstRecord = dataRecords[0];

        const numClassesStat = firstRecord?.dataStats?.find(
            (stat: any) => stat.name === "num_classes"
        );

        if (numClassesStat && Array.isArray(numClassesStat.value) && numClassesStat.value.length > 0) {
            const num = Math.max(1, Math.round(numClassesStat.value[0]));
            classIds = Array.from({ length: num }, (_, i) => i);
        } else {
            const classIdSet = new Set<number>();
            const labelStat = firstRecord?.dataStats?.find(
                (stat: any) => stat.name === "label" && stat.type === "array"
            );
            const predStat = firstRecord?.dataStats?.find(
                (stat: any) => stat.name === "pred_mask" && stat.type === "array"
            );

            const collectFromStat = (stat: any | undefined) => {
                if (!stat || !Array.isArray(stat.value)) return;
                const arr = stat.value as number[];
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (typeof v === "number" && !Number.isNaN(v)) {
                        classIdSet.add(v);
                    }
                    if (classIdSet.size > 256) break;
                }
            };
            collectFromStat(labelStat);
            collectFromStat(predStat);
            classIds = Array.from(classIdSet).sort((a, b) => a - b);
        }

        this.classIds = classIds;

        if (classIds.length === 0) {
            this.updateCallback?.();
            return;
        }

        // 4) Classes + colors section (segmentation only) into dedicated slot
        const classesSlot = document.getElementById("segmentation-classes-slot");
        if (classesSlot) {
            classesSlot.innerHTML = "";
            const container = document.createElement("div");
            container.className = "checkbox-inputs";
            const totalClasses = classIds.length;

            const makeColorForIndex = (idx: number): string => {
                const hue = Math.round((360 * idx) / Math.max(1, totalClasses));
                const saturation = 70;
                const lightness = 50;
                return hslToHex(hue, saturation, lightness);
            };

            classIds.forEach((id, idx) => {
                const wrapper = document.createElement("div");
                wrapper.style.display = "flex";
                wrapper.style.alignItems = "center";
                wrapper.style.gap = "0.25rem";

                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.id = `seg-class-enabled-${id}`;
                cb.checked = true;

                const nameSpan = document.createElement("span");
                nameSpan.textContent = `${id}`;
                nameSpan.style.fontSize = "0.78rem";

                const colorInput = document.createElement("input");
                colorInput.type = "color";
                colorInput.id = `seg-class-color-${id}`;
                colorInput.value = makeColorForIndex(idx);
                colorInput.style.width = "20px";
                colorInput.style.height = "20px";
                colorInput.style.border = "none";
                colorInput.style.padding = "0";
                colorInput.style.borderRadius = "50%";
                colorInput.style.cursor = "pointer";

                cb.addEventListener("change", () => this.updateCallback?.());
                colorInput.addEventListener("input", () => this.updateCallback?.());

                wrapper.appendChild(cb);
                wrapper.appendChild(nameSpan);
                wrapper.appendChild(colorInput);
                container.appendChild(wrapper);
            });
            classesSlot.appendChild(container);
        }

        this.updateSortUI();
        this.updateCallback?.();
    }

    private formatFieldName(name: string): string {
        return name.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
    }

    private sortCallback: ((query: string) => void) | null = null;

    // Sort logic support: Field, Direction, Locked status
    private sortState: Array<{ field: string; direction: 'asc' | 'desc'; locked: boolean }> = [];

    onSort(callback: (query: string) => void): void {
        this.sortCallback = callback;
    }

    private handleLockToggle(fieldName: string) {
        const entry = this.sortState.find(s => s.field === fieldName);
        if (entry) {
            entry.locked = !entry.locked;
            this.updateSortUI();
            // Lock state change doesn't trigger new query, just changes future behavior
        }
    }

    private handleSort(fieldName: string) {
        // 1. Check if we have detected this field as 'complex' (unsortable)
        const type = this.fieldTypes.get(fieldName);

        // We consider it unsortable if it's an image, or a high-dimensional array/tensor.
        // Special case: 'tags' are technically an array but we sort them by their string representation.
        const isComplexType = (type === 'image' || type === 'tensor' || type === 'array');
        const isWhitelisted = fieldName === 'tags' || fieldName === 'task_type';

        // Dynamic Unsortability Check:
        // If it's a complex type and NOT whitelisted, we check its values.
        let isUnsortable = isComplexType && !isWhitelisted;

        // Note: Field-specific overrides based on task context
        if (this.isSegmentationDataset && (fieldName === 'target' || fieldName === 'label' || fieldName === 'prediction')) {
            isUnsortable = true;
        }

        if (isUnsortable) {
            const cb = this.checkboxes.get(fieldName);
            // Search for wrapper - handle both direct parent and nested structures
            const wrapper = cb?.closest('.checkbox-wrapper');
            const label = wrapper?.querySelector('.sortable-label');
            if (label) {
                label.classList.add('shake-animation');
                setTimeout(() => label.classList.remove('shake-animation'), 500);
            }
            return;
        }

        const existingIndex = this.sortState.findIndex(s => s.field === fieldName);

        if (existingIndex !== -1) {
            // Already sorted - cycle: Asc -> Desc -> Off
            // BUT if locked, can we turn it off? Assumed yes, user action overrides.
            const entry = this.sortState[existingIndex];
            if (entry.direction === 'asc') {
                entry.direction = 'desc';
            } else {
                // Remove from sort list
                this.sortState.splice(existingIndex, 1);
            }
        } else {
            // New sort
            // Logic: Keep all LOCKED fields. Remove sorted UNLOCKED fields. Add New.
            const keptSorts = this.sortState.filter(s => s.locked);

            // Add new field to the end (it becomes the secondary/tertiary sort key)
            // Wait, usually "Sort by X" means X becomes Primary?
            // "Apply another sorting on top of this" ->
            // If I have [Tags, Locked], and click Target.
            // Result: [Tags, Target]. Group by Tags, then by Target.
            // This is "stable sort on top".
            keptSorts.push({ field: fieldName, direction: 'asc', locked: false });
            this.sortState = keptSorts;
        }

        this.updateSortUI();
        this.triggerSortCallback();
    }

    private triggerSortCallback() {
        if (!this.sortCallback) return;

        if (this.sortState.length === 0) {
            this.sortCallback(`sortby index asc`);
            return;
        }

        // Build query components
        const parts = this.sortState.map(s => {
            let queryCol = s.field;
            // Map UI field names to DB column names
            if (s.field === 'sampleId') queryCol = 'sample_id';
            if (s.field === 'label') queryCol = 'target';
            if (s.field === 'pred') queryCol = 'prediction';

            // Quote if necessary
            if (queryCol.includes(' ')) {
                queryCol = `\`${queryCol}\``;
            }
            return `${queryCol} ${s.direction}`;
        });

        const query = `sortby ${parts.join(', ')}`;
        this.sortCallback(query);
    }

    private updateSortUI() {
        // Remove separate container if it exists (cleanup from previous mode)
        const container = this.element.querySelector('#active-sorts-container');
        if (container) container.remove();

        this.checkboxes.forEach((_, field) => {
            const cb = this.checkboxes.get(field);
            if (!cb) return;

            const wrapper = cb.parentElement;
            if (!wrapper) return;
            const labelText = wrapper.querySelector('.sortable-label') as HTMLElement;
            if (!labelText) return;

            // Clean up old stuff
            const existingIndicators = wrapper.querySelector('.sort-indicators');
            if (existingIndicators) existingIndicators.remove();

            const badge = wrapper.querySelector('.sort-badge');
            if (badge) badge.remove();

            const entry = this.sortState.find(s => s.field === field);
            const index = this.sortState.findIndex(s => s.field === field);

            if (entry) {
                labelText.style.fontWeight = 'bold';
                labelText.style.color = 'var(--accent-color)';

                // Create inline indicators container
                const indicators = document.createElement('span');
                indicators.className = 'sort-indicators';
                indicators.style.marginLeft = 'auto'; // Push to right if wrapper is flex
                indicators.style.display = 'flex';
                indicators.style.alignItems = 'center';
                indicators.style.gap = '6px';
                indicators.style.fontSize = '0.85em';
                indicators.style.color = 'var(--fg-secondary)'; // Subtle default

                // 1. Arrow & Rank
                const sortDetail = document.createElement('span');
                sortDetail.style.display = 'flex';
                sortDetail.style.alignItems = 'center';
                sortDetail.style.gap = '4px';
                sortDetail.style.cursor = 'pointer';
                const arrowSvg = entry.direction === 'asc'
                    ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"></path></svg>`
                    : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`;
                const rankText = this.sortState.length > 1 ? `<span>${index + 1}</span>` : '';

                sortDetail.innerHTML = `${rankText}${arrowSvg}`;
                sortDetail.style.color = 'var(--accent-color)';

                // Clicking arrow toggles direction
                sortDetail.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Manual cycle: asc -> desc -> asc
                    entry.direction = entry.direction === 'asc' ? 'desc' : 'asc';
                    this.updateSortUI();
                    this.triggerSortCallback();
                });
                indicators.appendChild(sortDetail);

                // 2. Lock
                const lockBtn = document.createElement('span');
                lockBtn.style.display = 'flex';
                lockBtn.style.alignItems = 'center';
                lockBtn.style.cursor = 'pointer';
                const lockSvg = entry.locked
                    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
                    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;

                lockBtn.innerHTML = lockSvg;
                lockBtn.style.color = entry.locked ? 'var(--accent-color)' : 'var(--fg-muted, #888)';
                lockBtn.title = entry.locked ? "Locked (click to unlock)" : "Unlocked (click to lock)";

                lockBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Vital: prevent triggering sort toggle
                    entry.locked = !entry.locked;
                    this.updateSortUI();
                });
                indicators.appendChild(lockBtn);

                wrapper.appendChild(indicators);

            } else {
                labelText.style.fontWeight = 'normal';
                labelText.style.color = '';
            }
        });
    }

    getDisplayPreferences(): DisplayPreferences {
        const preferences: DisplayPreferences = {};
        for (const [field, checkbox] of this.checkboxes.entries()) {
            preferences[field] = checkbox.checked;
        }

        const rawToggle = document.getElementById("toggle-raw") as HTMLInputElement | null;
        const gtToggle = document.getElementById("toggle-gt") as HTMLInputElement | null;
        const predToggle = document.getElementById("toggle-pred") as HTMLInputElement | null;
        const diffToggle = document.getElementById("toggle-diff") as HTMLInputElement | null;

        preferences.showRawImage = rawToggle ? rawToggle.checked : true;
        preferences.showGtMask = gtToggle ? gtToggle.checked : true;
        preferences.showPredMask = predToggle ? predToggle.checked : true;
        preferences.showDiffMask = diffToggle ? diffToggle.checked : false;

        const classPreferences: Record<number, ClassPreference> = {};
        for (const id of this.classIds) {
            const cb = document.getElementById(`seg-class-enabled-${id}`) as HTMLInputElement | null;
            const colorInput = document.getElementById(`seg-class-color-${id}`) as HTMLInputElement | null;

            classPreferences[id] = {
                enabled: cb ? cb.checked : id !== 0,
                color: colorInput ? colorInput.value : "#ffffff",
            };
        }
        preferences.classPreferences = classPreferences;

        return preferences;
    }

    initializeStatsOptions(statsNames: string[]): void {
        this.availableStats = statsNames;
    }

    private setupControlListeners(): void {
        const cellSizeSlider = document.getElementById("cell-size") as HTMLInputElement;
        const cellSizeValue = document.getElementById("cell-size-value");

        if (cellSizeSlider && cellSizeValue) {
            cellSizeSlider.addEventListener("input", () => {
                cellSizeValue.textContent = cellSizeSlider.value;
                localStorage.setItem('grid-cell-size', cellSizeSlider.value);
                this.updateCallback?.();
            });
        }

        const zoomSlider = document.getElementById("zoom-level") as HTMLInputElement;
        const zoomValue = document.getElementById("zoom-value");

        if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener("input", () => {
                zoomValue.textContent = `${zoomSlider.value}%`;
                localStorage.setItem('grid-zoom-level', zoomSlider.value);
                this.updateCallback?.();
            });
        }

        const rawToggle = document.getElementById("toggle-raw") as HTMLInputElement | null;
        const gtToggle = document.getElementById("toggle-gt") as HTMLInputElement | null;
        const predToggle = document.getElementById("toggle-pred") as HTMLInputElement | null;
        const diffToggle = document.getElementById("toggle-diff") as HTMLInputElement | null;

        const imageResolutionAuto = document.getElementById("image-resolution-auto") as HTMLInputElement | null;
        const imageResolutionPercent = document.getElementById("image-resolution-percent") as HTMLInputElement | null;

        if (imageResolutionAuto) {
            imageResolutionAuto.addEventListener("change", () => {
                localStorage.setItem('grid-image-resolution-auto', imageResolutionAuto.checked.toString());
                this.updateCallback?.();
            });
        }
        if (imageResolutionPercent) {
            imageResolutionPercent.addEventListener("input", () => {
                localStorage.setItem('grid-image-resolution-percent', imageResolutionPercent.value);
                this.updateCallback?.();
            });
        }

        const onToggleChange = () => { this.updateCallback?.(); };

        if (rawToggle) rawToggle.addEventListener("change", onToggleChange);
        if (gtToggle) gtToggle.addEventListener("change", onToggleChange);
        if (predToggle) predToggle.addEventListener("change", onToggleChange);
        if (diffToggle) diffToggle.addEventListener("change", onToggleChange);
    }

    getCellSize(): number {
        const cellSizeSlider = document.getElementById("cell-size") as HTMLInputElement;
        return cellSizeSlider ? parseInt(cellSizeSlider.value) : 128;
    }

    getZoomLevel(): number {
        const zoomSlider = document.getElementById("zoom-level") as HTMLInputElement;
        return zoomSlider ? parseInt(zoomSlider.value) / 100 : 1.0;
    }

    initialize(): void {
        // nothing extra
    }
}
