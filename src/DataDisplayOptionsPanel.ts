
import { DataRecord } from "./data_service";

export type SplitColors = {
    train: string;
    eval: string;
};

export type DisplayPreferences = {
    [key: string]: boolean | SplitColors;
    splitColors?: SplitColors;

    // segmentation-layer toggles
    showRawImage?: boolean;
    showGtMask?: boolean;
    showPredMask?: boolean;
    showDiffMask?: boolean;

    classPreferences?: Record<number, ClassPreference>;
};

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;

    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const toHex = (x: number) => {
        const v = Math.round(255 * x).toString(16).padStart(2, '0');
        return v;
    };

    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export class DataDisplayOptionsPanel {
    private element: HTMLElement; // The options-section container
    private checkboxes: Map<string, HTMLInputElement> = new Map();
    private availableStats: string[] = [];
    private updateCallback: (() => void) | null = null;
    private classIds: number[] = [];

    constructor(container: HTMLElement) {
        // Use the existing options-section container
        this.element = container;
        this.setupControlListeners();
    }

    getElement(): HTMLElement {
        return this.element;
    }

    onUpdate(callback: () => void): void {
        this.updateCallback = callback;
        this.element.addEventListener('preferencesChange', () => callback());
    }

    populateOptions(dataRecords: DataRecord[]): void {
        if (!dataRecords || dataRecords.length === 0) {
            console.warn('[DataDisplayOptionsPanel] No data records provided');
            return;
        }

        const firstRecord = dataRecords[0];
        const availableFields = new Set<string>();

        // ------------------------------------------------------------
        // 1) Collect "Details" fields (sampleId + all stats except raw_data)
        // ------------------------------------------------------------
        availableFields.add('sampleId');

        if (firstRecord.dataStats) {
            console.log('[DataDisplayOptionsPanel] First record dataStats:', firstRecord.dataStats);
            console.log('[DataDisplayOptionsPanel] Number of stats:', firstRecord.dataStats.length);

            firstRecord.dataStats.forEach(stat => {
                console.log(`[DataDisplayOptionsPanel] Processing stat: ${stat.name}, type: ${typeof stat.name}`);
                if (stat.name !== 'raw_data') {
                    availableFields.add(stat.name);
                }
            });
        } else {
            console.warn('[DataDisplayOptionsPanel] No dataStats found in first record');
        }

        // Synthetic segmentation layer toggles (not real stats)
        availableFields.add('showRawImage');
        availableFields.add('showGtMask');
        availableFields.add('showPredMask');
        availableFields.add('showDiffMask'); // NEW

        console.log('[DataDisplayOptionsPanel] Available fields after processing:', Array.from(availableFields));

        // ------------------------------------------------------------
        // 2) Clear the "Details" row and rebuild its checkboxes
        // ------------------------------------------------------------
        this.element.innerHTML = '';
        this.checkboxes.clear();

        availableFields.forEach(fieldName => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `display-${fieldName}`;
            checkbox.value = fieldName;

            // Defaults:
            // - sampleId: on
            // - loss: on (if present)
            // - segmentation toggles: raw/gt/pred ON, diff OFF by default
            checkbox.checked =
                fieldName === 'sampleId' ||
                fieldName === 'loss' ||
                fieldName === 'showRawImage' ||
                fieldName === 'showGtMask' ||
                fieldName === 'showPredMask';

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;

            if (fieldName === 'showRawImage') {
                label.textContent = 'Raw image (overlay)';
            } else if (fieldName === 'showGtMask') {
                label.textContent = 'GT mask (overlay)';
            } else if (fieldName === 'showPredMask') {
                label.textContent = 'Pred mask (overlay)';
            } else if (fieldName === 'showDiffMask') {
                label.textContent = 'Diff map (overlay)';
            } else {
                label.textContent = this.formatFieldName(fieldName);
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-wrapper';
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);

            this.element.appendChild(wrapper);

            this.checkboxes.set(fieldName, checkbox);

            checkbox.addEventListener('change', () => {
                this.updateCallback?.();
            });
        });

        console.log('[DataDisplayOptionsPanel] Created checkboxes for:', Array.from(this.checkboxes.keys()));

        // ------------------------------------------------------------
        // 3) Determine segmentation class IDs
        //    Prefer backend-provided num_classes; fall back to scanning
        // ------------------------------------------------------------
        let classIds: number[] = [];

        const numClassesStat = firstRecord.dataStats?.find(
            stat => stat.name === 'num_classes'
        );

        if (numClassesStat && Array.isArray(numClassesStat.value) && numClassesStat.value.length > 0) {
            const num = Math.max(1, Math.round(numClassesStat.value[0]));
            classIds = Array.from({ length: num }, (_, i) => i);
            console.log('[DataDisplayOptionsPanel] Using num_classes from backend:', num);
        } else {
            // Fallback: infer from label/pred of first record (not ideal, but robust)
            const classIdSet = new Set<number>();

            const labelStat = firstRecord.dataStats?.find(
                stat => stat.name === 'label' && stat.type === 'array'
            );
            const predStat = firstRecord.dataStats?.find(
                stat => stat.name === 'pred_mask' && stat.type === 'array'
            );

            const collectFromStat = (stat: any | undefined) => {
                if (!stat || !Array.isArray(stat.value)) return;
                const arr = stat.value as number[];
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (typeof v === 'number' && !Number.isNaN(v)) {
                        classIdSet.add(v);
                    }
                    if (classIdSet.size > 256) break; // safety
                }
            };

            collectFromStat(labelStat);
            collectFromStat(predStat);

            classIds = Array.from(classIdSet).sort((a, b) => a - b);
            console.log('[DataDisplayOptionsPanel] Fallback detected class IDs:', classIds);
        }

        this.classIds = classIds;

        if (classIds.length === 0) {
            // Non-segmentation dataset or no mask info; nothing more to build
            this.updateCallback?.();
            return;
        }

        // ------------------------------------------------------------
        // 4) Build "Segmentation classes" section with per-class toggle + color
        // ------------------------------------------------------------
        const classesSection = document.createElement('div');
        classesSection.className = 'options-section';

        const row = document.createElement('div');
        row.className = 'options-row';

        const label = document.createElement('label');
        label.innerHTML = '<b>Segmentation classes</b>';
        row.appendChild(label);

        const container = document.createElement('div');
        container.className = 'checkbox-inputs';

        const totalClasses = classIds.length;

        const makeColorForIndex = (idx: number): string => {
            const hue = Math.round((360 * idx) / Math.max(1, totalClasses));
            const saturation = 70;
            const lightness = 50;
            return hslToHex(hue, saturation, lightness);
        };

        classIds.forEach((id, idx) => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '0.25rem';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = `seg-class-enabled-${id}`;
            // Convention: background (= 0) off by default; others on
            cb.checked = id !== 0;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = `class ${id}`;
            nameSpan.style.fontSize = '0.78rem';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.id = `seg-class-color-${id}`;
            colorInput.value = makeColorForIndex(idx);
            colorInput.style.width = '20px';
            colorInput.style.height = '20px';
            colorInput.style.border = 'none';
            colorInput.style.padding = '0';

            cb.addEventListener('change', () => this.updateCallback?.());
            colorInput.addEventListener('input', () => this.updateCallback?.());

            wrapper.appendChild(cb);
            wrapper.appendChild(nameSpan);
            wrapper.appendChild(colorInput);
            container.appendChild(wrapper);
        });

        row.appendChild(container);
        classesSection.appendChild(row);

        // Append the new section right after the Details section.
        // this.element is the "details-options-row" div; its parent is the .options-section
        const optionsSection = this.element.parentElement;
        if (optionsSection) {
            optionsSection.appendChild(classesSection);
        } else {
            // Fallback: append directly to this.element
            this.element.appendChild(classesSection);
        }

        // ------------------------------------------------------------
        // 5) Trigger initial update
        // ------------------------------------------------------------
        this.updateCallback?.();
    }


    private formatFieldName(name: string): string {
        return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    getDisplayPreferences(): DisplayPreferences {
        const preferences: DisplayPreferences = {};

        // existing stats checkboxes
        for (const [field, checkbox] of this.checkboxes.entries()) {
            preferences[field] = checkbox.checked;
        }

        const rawToggle = document.getElementById('toggle-raw') as HTMLInputElement | null;
        const gtToggle = document.getElementById('toggle-gt') as HTMLInputElement | null;
        const predToggle = document.getElementById('toggle-pred') as HTMLInputElement | null;
        const diffToggle = document.getElementById('toggle-diff') as HTMLInputElement | null;

        preferences.showRawImage = rawToggle ? rawToggle.checked : true;
        preferences.showGtMask = gtToggle ? gtToggle.checked : true;
        preferences.showPredMask = predToggle ? predToggle.checked : true;
        preferences.showDiffMask = diffToggle ? diffToggle.checked : false;

        // NEW: per-class preferences
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
                color: colorInput ? colorInput.value : '#ffffff',
            };
        }
        preferences.classPreferences = classPreferences;

        return preferences;
    }


    initializeStatsOptions(statsNames: string[]): void {
        console.log('[DisplayOptionsPanel] Initializing stats options:', statsNames);
        this.availableStats = statsNames;
    }

    private setupControlListeners(): void {
        // Cell size slider
        const cellSizeSlider = document.getElementById('cell-size') as HTMLInputElement;
        const cellSizeValue = document.getElementById('cell-size-value');

        if (cellSizeSlider && cellSizeValue) {
            cellSizeSlider.addEventListener('input', () => {
                cellSizeValue.textContent = cellSizeSlider.value;
                this.updateCallback?.();
            });
        }

        // Zoom slider
        const zoomSlider = document.getElementById('zoom-level') as HTMLInputElement;
        const zoomValue = document.getElementById('zoom-value');

        if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener('input', () => {
                zoomValue.textContent = `${zoomSlider.value}%`;
                this.updateCallback?.();
            });
        }

        const rawToggle = document.getElementById('toggle-raw') as HTMLInputElement | null;
        const gtToggle = document.getElementById('toggle-gt') as HTMLInputElement | null;
        const predToggle = document.getElementById('toggle-pred') as HTMLInputElement | null;
        const diffToggle = document.getElementById('toggle-diff') as HTMLInputElement | null;

        const onToggleChange = () => { this.updateCallback?.(); };

        if (rawToggle) rawToggle.addEventListener('change', onToggleChange);
        if (gtToggle) gtToggle.addEventListener('change', onToggleChange);
        if (predToggle) predToggle.addEventListener('change', onToggleChange);
        if (diffToggle) diffToggle.addEventListener('change', onToggleChange);
    }

    getCellSize(): number {
        const cellSizeSlider = document.getElementById('cell-size') as HTMLInputElement;
        return cellSizeSlider ? parseInt(cellSizeSlider.value) : 128;
    }

    getZoomLevel(): number {
        const zoomSlider = document.getElementById('zoom-level') as HTMLInputElement;
        return zoomSlider ? parseInt(zoomSlider.value) / 100 : 1.0;
    }

    initialize(): void {
        // No need to setup expand/collapse - that's handled by the parent control panel
    }
}
