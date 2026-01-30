import { handleQuerySubmit } from "./data";

export class QuickFiltersUI {
    private modeChatBtn: HTMLElement | null;
    private modeFiltersBtn: HTMLElement | null;
    private chatArea: HTMLElement | null;
    private filtersArea: HTMLElement | null;

    private sortColSelect: HTMLSelectElement | null;
    private sortDirSelect: HTMLSelectElement | null;

    private filterColSelect: HTMLSelectElement | null;
    private filterOpSelect: HTMLSelectElement | null;
    private filterValInput: HTMLInputElement | null;
    private addFilterBtn: HTMLElement | null;

    private chipsContainer: HTMLElement | null;
    private applyBtn: HTMLButtonElement | null;

    private activeFilters: Array<{ col: string, op: string, val: string }> = [];
    private onApplyCallback: ((query: string, bypassAgent: boolean) => Promise<void>) | null = null;

    // TODO: Dynamic columns from backend
    private columns: string[] = [];

    constructor() {
        this.modeChatBtn = document.getElementById('mode-chat');
        this.modeFiltersBtn = document.getElementById('mode-filters');
        this.chatArea = document.getElementById('chat-input-area');
        this.filtersArea = document.getElementById('filters-input-area');

        this.sortColSelect = document.getElementById('qf-sort-column') as HTMLSelectElement;
        this.sortDirSelect = document.getElementById('qf-sort-direction') as HTMLSelectElement;

        this.filterColSelect = document.getElementById('qf-filter-column') as HTMLSelectElement;
        this.filterOpSelect = document.getElementById('qf-filter-operator') as HTMLSelectElement;
        this.filterValInput = document.getElementById('qf-filter-value') as HTMLInputElement;
        this.addFilterBtn = document.getElementById('qf-add-filter');

        this.chipsContainer = document.getElementById('qf-chips-container');
        this.applyBtn = document.getElementById('qf-apply') as HTMLButtonElement;

        this.initListeners();
    }

    private initListeners() {
        // Mode Toggling
        this.modeChatBtn?.addEventListener('click', () => this.setMode('chat'));
        this.modeFiltersBtn?.addEventListener('click', () => this.setMode('filters'));

        // Sort Change
        this.sortColSelect?.addEventListener('change', () => this.updateButtonsState());

        // Add Filter
        this.addFilterBtn?.addEventListener('click', () => this.addFilter());
        this.filterValInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addFilter();
        });

        // Remove Filter (Event delegation)
        this.chipsContainer?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('filter-chip-remove')) {
                const index = parseInt(target.dataset.index || '-1');
                if (index >= 0) this.removeFilter(index);
            }
        });

        // Apply & Clear
        this.applyBtn?.addEventListener('click', () => this.applyAll());
    }

    public setAvailableColumns(cols: string[]) {
        this.columns = cols;
        const populate = (sel: HTMLSelectElement | null, defaultText: string) => {
            if (!sel) return;
            sel.innerHTML = `<option value="">${defaultText}</option>`;
            cols.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                sel.appendChild(opt);
            });
        };

        populate(this.sortColSelect, "-- None --");
        populate(this.filterColSelect, "-- Column --");
    }

    public onApply(cb: (query: string, bypassAgent: boolean) => Promise<void>) {
        this.onApplyCallback = cb;
    }

    private setMode(mode: 'chat' | 'filters') {
        if (mode === 'chat') {
            this.modeChatBtn?.classList.add('active');
            this.modeFiltersBtn?.classList.remove('active');
            this.chatArea?.classList.add('active');
            this.filtersArea?.classList.remove('active');
        } else {
            this.modeFiltersBtn?.classList.add('active');
            this.modeChatBtn?.classList.remove('active');
            this.filtersArea?.classList.add('active');
            this.chatArea?.classList.remove('active');
        }
    }

    private addFilter() {
        const col = this.filterColSelect?.value;
        const op = this.filterOpSelect?.value;
        const val = this.filterValInput?.value?.trim();

        if (!col || !op || !val) return;

        this.activeFilters.push({ col, op, val });
        // Reset inputs
        if (this.filterValInput) this.filterValInput.value = '';
        if (this.filterColSelect) this.filterColSelect.value = '';

        this.renderChips();
        this.updateButtonsState();
    }

    private removeFilter(index: number) {
        this.activeFilters.splice(index, 1);
        this.renderChips();
        this.updateButtonsState();
    }

    private clearAll() {
        this.activeFilters = [];
        this.renderChips();
        this.updateButtonsState();
        if (this.sortColSelect) this.sortColSelect.value = "";
    }

    private renderChips() {
        if (!this.chipsContainer) return;

        this.chipsContainer.innerHTML = '';
        const containerSection = document.getElementById('qf-active-filters');

        if (this.activeFilters.length === 0) {
            if (containerSection) containerSection.style.display = 'none';
            return;
        }

        if (containerSection) containerSection.style.display = 'flex';

        this.activeFilters.forEach((f, i) => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';

            // Display friendly operator
            let opDisplay = f.op;
            if (f.op === '==') opDisplay = '=';
            if (f.op === 'contains') opDisplay = 'contains';

            chip.innerHTML = `
                <span>${f.col} ${opDisplay} ${f.val}</span>
                <button class="filter-chip-remove" data-index="${i}">×</button>
            `;
            this.chipsContainer?.appendChild(chip);
        });
    }

    private updateButtonsState() {
        const hasFilters = this.activeFilters.length > 0;
        // Sort might be selected even if no filters
        const hasSort = !!this.sortColSelect?.value;

        const canApply = hasFilters || hasSort;

        if (this.applyBtn) this.applyBtn.disabled = !canApply;
    }

    private buildQuery(): string {
        // Construct the Pandas-like query string
        // Format: "(col == val) and (col2 > val2) sortby col asc"

        const filterParts = this.activeFilters.map(f => {
            // Escape column name with backticks if it has spaces or special chars
            // Assuming simplified check: contains slash, space, or hyphen
            const colName = (f.col.match(/[\s\/\-]/)) ? `\`${f.col}\`` : f.col;

            let val = f.val;
            // Best effort number parsing: if it looks like a number, treat as number?
            // Or rely on backend parsing.
            // Quotes for strings:
            const isNumber = !isNaN(Number(val)) && val !== '';

            if (f.op === 'contains') {
                // For contains, usually: col.str.contains('val')
                // But backend might parse normalized syntax. 
                // Let's assume the backend expects Python syntax for pandas query if directly executed.
                // "col.str.contains('val')"
                // But the current backend implementation uses df.query() or eval(). 
                // df.query doesn't support .str accessor easily without complex syntax.
                // Assuming the 'raw eval' fallback in backend handles it.
                return `${colName}.str.contains('${val}')`;
            } else {
                if (!isNumber) {
                    val = `"${val}"`;
                }
                return `${colName} ${f.op} ${val}`;
            }
        });

        let query = filterParts.join(' and ');

        // Add Sorting
        const sortCol = this.sortColSelect?.value;
        if (sortCol) {
            const sortDir = this.sortDirSelect?.value || 'desc'; // Default to desc per UI
            const sortColEscaped = (sortCol.match(/[\s\/\-]/)) ? `\`${sortCol}\`` : sortCol;
            query += ` sortby ${sortColEscaped} ${sortDir}`;
        }

        return query.trim();
    }

    private async applyAll() {
        if (!this.onApplyCallback) return;
        const query = this.buildQuery();

        // Pass 'bypassAgent = true' to signal structured query
        // The backend expects isNaturalLanguage: false
        await this.onApplyCallback(query, true);
    }
}

// Global initializer
export function initModeToggle() {
    return new QuickFiltersUI();
}
