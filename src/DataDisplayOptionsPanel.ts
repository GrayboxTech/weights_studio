
import { DataRecord } from "./data_service";

export type SplitColors = {
    train: string;
    eval: string;
};

export type DisplayPreferences = {
    [key: string]: boolean;
    splitColors?: SplitColors;
};

export class DataDisplayOptionsPanel {
    private element: HTMLElement; // The options-section container
    private checkboxes: Map<string, HTMLInputElement> = new Map();
    private availableStats: string[] = [];
    private updateCallback: (() => void) | null = null;

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

        // Add sampleId
        availableFields.add('sampleId');

        // Add all dataStats fields (use exact names, no camelCase conversion)
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

        console.log('[DataDisplayOptionsPanel] Available fields after processing:', Array.from(availableFields));

        // Load saved preferences from localStorage
        const savedPreferences = localStorage.getItem('displayPreferences');
        const savedPrefs = savedPreferences ? JSON.parse(savedPreferences) : {};

        // Clear existing checkboxes
        this.element.innerHTML = '';
        this.checkboxes.clear(); // Clear the Map too

        // Create checkboxes for each field
        availableFields.forEach(fieldName => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `display-${fieldName}`;
            checkbox.value = fieldName;
            
            // Check saved preference, or default to sampleId and loss
            if (savedPrefs.hasOwnProperty(fieldName)) {
                checkbox.checked = savedPrefs[fieldName];
            } else {
                checkbox.checked = (fieldName === 'sampleId' || fieldName === 'loss');
            }

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = fieldName; // Use exact name, no formatting

            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-wrapper';
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);

            this.element.appendChild(wrapper);

            // Store checkbox in Map
            this.checkboxes.set(fieldName, checkbox);

            checkbox.addEventListener('change', () => {
                this.savePreferences();
                this.updateCallback?.();
            });
        });

        console.log('[DataDisplayOptionsPanel] Created checkboxes for:', Array.from(this.checkboxes.keys()));

        // Trigger initial update
        this.updateCallback?.();
    }

    private formatFieldName(name: string): string {
        return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    getDisplayPreferences(): DisplayPreferences {
        const preferences: DisplayPreferences = {};
        // Query actual checkboxes from the Map
        for (const [field, checkbox] of this.checkboxes.entries()) {
            preferences[field] = checkbox.checked;
        }
        return preferences;
    }

    savePreferences(): void {
        const preferences = this.getDisplayPreferences();
        localStorage.setItem('displayPreferences', JSON.stringify(preferences));
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
