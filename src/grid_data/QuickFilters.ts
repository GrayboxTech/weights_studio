/**
 * QuickFilters.ts
 *
 * Manages the quick filters bar UI and state.
 * Provides direct filtering without using the LLM agent.
 */

export interface Manager {
    column: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'between' | 'contains' | 'has_tag' | 'not_has_tag';
    value: string | number;
    value2?: number; // For 'between' operator
}

export interface SortCondition {
    column: string;
    direction: 'asc' | 'desc';
}

export interface QuickFilterState {
    filters: FilterCondition[];
    sort: SortCondition | null;
}

export class QuickFiltersManager {
    private container: HTMLElement;
    private state: QuickFilterState;
    private availableColumns: Map<string, string>; // column name -> type
    private onApplyCallback: ((state: QuickFilterState) => Promise<void>) | null = null;

    constructor(containerId: string) {
        const element = document.getElementById(containerId);
        if (!element) {
            throw new Error(`QuickFilters container #${containerId} not found`);
        }
        this.container = element;
        this.state = { filters: [], sort: null };
        this.availableColumns = new Map();
        this.initialize();
    }

    private initialize() {
        this.render();
        this.attachEventListeners();
    }

    /**
     * Set available columns from dataframe metadata
     */
    public setAvailableColumns(columns: Map<string, string>) {
        this.availableColumns = columns;
        this.render();
    }

    /**
     * Register callback for when filters are applied
     */
    public onApply(callback: (state: QuickFilterState) => Promise<void>) {
        this.onApplyCallback = callback;
    }

    /**
     * Get current filter state
     */
    public getState(): QuickFilterState {
        return { ...this.state };
    }

    /**
     * Clear all filters
     */
    public clear() {
        this.state = { filters: [], sort: null };
        this.render();
    }

    /**
     * Add a new filter condition
     */
    public addFilter(condition: FilterCondition) {
        this.state.filters.push(condition);
        this.render();
    }

    /**
     * Remove filter at index
     */
    public removeFilter(index: number) {
        this.state.filters.splice(index, 1);
        this.render();
    }

    /**
     * Set sort condition
     */
    public setSort(sort: SortCondition | null) {
        this.state.sort = sort;
        this.render();
    }

    /**
     * Render the filters bar
     */
    private render() {
        const hasActiveFilters = this.state.filters.length > 0 || this.state.sort !== null;

        this.container.innerHTML = `
            <div class="quick-filters-content">
                <div class="filters-header">
                    <span class="filters-title">Quick Filters</span>
                    ${hasActiveFilters ? '<span class="active-indicator">●</span>' : ''}
                </div>

                <!-- Active Filters Display -->
                ${this.renderActiveFilters()}

                <!-- Sort Controls -->
                ${this.renderSortControls()}

                <!-- Filter Builder -->
                ${this.renderFilterBuilder()}

                <!-- Actions -->
                <div class="filter-actions">
                    <button id="qf-apply" class="qf-btn qf-btn-primary" ${!hasActiveFilters ? 'disabled' : ''}>
                        Apply
                    </button>
                    <button id="qf-clear" class="qf-btn qf-btn-secondary" ${!hasActiveFilters ? 'disabled' : ''}>
                        Clear
                    </button>
                    <button id="qf-toggle" class="qf-btn qf-btn-icon" title="Hide filters">
                        ▲
                    </button>
                </div>
            </div>
        `;
    }

    private renderActiveFilters(): string {
        if (this.state.filters.length === 0) {
            return '';
        }

        const filterChips = this.state.filters.map((filter, idx) => {
            const valueText = filter.operator === 'between'
                ? `${filter.value} to ${filter.value2}`
                : filter.value;
            return `
                <div class="filter-chip" data-index="${idx}">
                    <span class="filter-text">${filter.column} ${filter.operator} ${valueText}</span>
                    <button class="filter-chip-remove" data-index="${idx}">×</button>
                </div>
            `;
        }).join('');

        return `
            <div class="active-filters-section">
                <label class="section-label">Active Filters:</label>
                <div class="filter-chips-container">
                    ${filterChips}
                </div>
            </div>
        `;
    }

    private renderSortControls(): string {
        const columnOptions = Array.from(this.availableColumns.keys())
            .map(col => `<option value="${col}" ${this.state.sort?.column === col ? 'selected' : ''}>${col}</option>`)
            .join('');

        return `
            <div class="sort-section">
                <label class="section-label">Sort By:</label>
                <div class="sort-controls">
                    <select id="qf-sort-column" class="qf-select">
                        <option value="">-- None --</option>
                        ${columnOptions}
                    </select>
                    <select id="qf-sort-direction" class="qf-select" ${!this.state.sort ? 'disabled' : ''}>
                        <option value="asc" ${this.state.sort?.direction === 'asc' ? 'selected' : ''}>Ascending</option>
                        <option value="desc" ${this.state.sort?.direction === 'desc' ? 'selected' : ''}>Descending</option>
                    </select>
                </div>
            </div>
        `;
    }

    private renderFilterBuilder(): string {
        const columnOptions = Array.from(this.availableColumns.keys())
            .map(col => `<option value="${col}">${col}</option>`)
            .join('');

        return `
            <div class="filter-builder-section">
                <label class="section-label">Add Filter:</label>
                <div class="filter-builder">
                    <select id="qf-filter-column" class="qf-select">
                        <option value="">-- Select Column --</option>
                        ${columnOptions}
                    </select>
                    <select id="qf-filter-operator" class="qf-select">
                        <option value="==">Equals (==)</option>
                        <option value="!=">Not Equals (!=)</option>
                        <option value=">">Greater Than (>)</option>
                        <option value="<">Less Than (<)</option>
                        <option value=">=">Greater or Equal (>=)</option>
                        <option value="<=">Less or Equal (<=)</option>
                        <option value="contains">Contains</option>
                        <option value="has_tag">Has Tag</option>
                        <option value="not_has_tag">Not Has Tag</option>
                    </select>
                    <input type="text" id="qf-filter-value" class="qf-input" placeholder="Value" />
                    <button id="qf-add-filter" class="qf-btn qf-btn-add">+ Add</button>
                </div>
            </div>
        `;
    }

    private attachEventListeners() {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Apply button
            if (target.id === 'qf-apply') {
                this.handleApply();
            }

            // Clear button
            if (target.id === 'qf-clear') {
                this.clear();
            }

            // Toggle visibility
            if (target.id === 'qf-toggle') {
                this.toggleVisibility();
            }

            // Remove filter chip
            if (target.classList.contains('filter-chip-remove')) {
                const index = parseInt(target.getAttribute('data-index') || '0');
                this.removeFilter(index);
            }

            // Add filter button
            if (target.id === 'qf-add-filter') {
                this.handleAddFilter();
            }
        });

        // Sort column change
        this.container.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;

            if (target.id === 'qf-sort-column') {
                if (target.value) {
                    this.setSort({
                        column: target.value,
                        direction: this.state.sort?.direction || 'asc'
                    });
                } else {
                    this.setSort(null);
                }
            }

            if (target.id === 'qf-sort-direction' && this.state.sort) {
                this.setSort({
                    column: this.state.sort.column,
                    direction: target.value as 'asc' | 'desc'
                });
            }
        });
    }

    private handleAddFilter() {
        const columnEl = document.getElementById('qf-filter-column') as HTMLSelectElement;
        const operatorEl = document.getElementById('qf-filter-operator') as HTMLSelectElement;
        const valueEl = document.getElementById('qf-filter-value') as HTMLInputElement;

        if (!columnEl.value || !valueEl.value.trim()) {
            alert('Please select a column and enter a value');
            return;
        }

        const filter: FilterCondition = {
            column: columnEl.value,
            operator: operatorEl.value as any,
            value: valueEl.value.trim()
        };

        this.addFilter(filter);

        // Reset inputs
        columnEl.value = '';
        valueEl.value = '';
    }

    private async handleApply() {
        if (this.onApplyCallback) {
            try {
                await this.onApplyCallback(this.state);
            } catch (error) {
                console.error('Error applying filters:', error);
                alert('Failed to apply filters. See console for details.');
            }
        }
    }

    private toggleVisibility() {
        const content = this.container.querySelector('.quick-filters-content') as HTMLElement;
        const toggleBtn = document.getElementById('qf-toggle');

        if (content && toggleBtn) {
            const isCollapsed = content.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '▼' : '▲';
            toggleBtn.title = isCollapsed ? 'Show filters' : 'Hide filters';
        }
    }

    /**
     * Show the filters bar
     */
    public show() {
        this.container.style.display = 'flex';
    }

    /**
     * Hide the filters bar
     */
    public hide() {
        this.container.style.display = 'none';
    }
}
