import { DataRecord } from "./data_service";

export type SplitColors = {
    train: string;
    eval: string;
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
    private availableStats: string[] = [];
    private updateCallback: (() => void) | null = null;
    private classIds: number[] = [];
    private isSegmentationDataset = false;

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

        const segmentationSection = document.querySelector(
            '[data-section="segmentation"]'
        ) as HTMLElement | null;
        if (segmentationSection) {
            segmentationSection.style.display = this.isSegmentationDataset ? "block" : "none";
        }
    }

    private detectSegmentation(records: DataRecord[]): boolean {
        for (const record of records) {
            const stats = record.dataStats || [];
            const taskTypeStat = stats.find((s: any) => s.name === "task_type");
            if (taskTypeStat?.valueString === "segmentation") return true;
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

        const currentPrefs = this.getDisplayPreferences();
        const availableFields = new Set<string>();

        // 0) Detect mode (check all records in batch for better detection)
        const wasSegmentation = this.isSegmentationDataset;
        this.isSegmentationDataset = this.detectSegmentation(dataRecords);
        if (this.isSegmentationDataset !== wasSegmentation) {
            this.updateGlobalModeFlags();
        }

        // 1) Collect all fields seen across all provided records
        availableFields.add("sampleId");
        availableFields.add("tags");

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
                });
            }
        });

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
            return;
        }

        // 2) rebuild details list while preserving checkbox states
        this.element.innerHTML = "";
        this.checkboxes.clear();

        const defaultCheckedFields = new Set([
            "sampleId",
            "mean_loss",
            "tags"
        ]);

        // Restore user preferences
        for (const field of Array.from(availableFields)) {
            if (currentPrefs[field] === true) {
                defaultCheckedFields.add(field);
            } else if (currentPrefs[field] === false) {
                defaultCheckedFields.delete(field);
            }
        }

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

            const label = document.createElement("label");
            label.htmlFor = checkbox.id;
            label.textContent = this.formatFieldName(fieldName);

            const wrapper = document.createElement("div");
            wrapper.className = "checkbox-wrapper";
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);

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
                cb.checked = id !== 0;

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

                cb.addEventListener("change", () => this.updateCallback?.());
                colorInput.addEventListener("input", () => this.updateCallback?.());

                wrapper.appendChild(cb);
                wrapper.appendChild(nameSpan);
                wrapper.appendChild(colorInput);
                container.appendChild(wrapper);
            });
            classesSlot.appendChild(container);
        }

        this.updateCallback?.();
    }

    private formatFieldName(name: string): string {
        return name.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
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
            const cb = document.getElementById(
                `seg-class-enabled-${id}`
            ) as HTMLInputElement | null;
            const colorInput = document.getElementById(
                `seg-class-color-${id}`
            ) as HTMLInputElement | null;

            classPreferences[id] = {
                enabled: cb ? cb.checked : id !== 0,
                color: colorInput ? colorInput.value : "#ffffff",
            };
        }
        preferences.classPreferences = classPreferences;

        return preferences;
    }

    savePreferences(): void {
        const preferences = this.getDisplayPreferences();
        localStorage.setItem('displayPreferences', JSON.stringify(preferences));
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
                this.updateCallback?.();
            });
        }

        const zoomSlider = document.getElementById("zoom-level") as HTMLInputElement;
        const zoomValue = document.getElementById("zoom-value");

        if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener("input", () => {
                zoomValue.textContent = `${zoomSlider.value}%`;
                this.updateCallback?.();
            });
        }

        const rawToggle = document.getElementById("toggle-raw") as HTMLInputElement | null;
        const gtToggle = document.getElementById("toggle-gt") as HTMLInputElement | null;
        const predToggle = document.getElementById("toggle-pred") as HTMLInputElement | null;
        const diffToggle = document.getElementById("toggle-diff") as HTMLInputElement | null;

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
