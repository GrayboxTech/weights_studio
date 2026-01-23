
import { GridCell } from "./GridCell";
import { DataRecord } from "./experiment_service";
import { DataDisplayOptionsPanel } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { SelectionManager } from "./SelectionManager";

const GRID_GAP = 4;


export class GridManager {
    private cellsContainer: HTMLElement;
    private traversalPanel: DataTraversalAndInteractionsPanel;
    private displayOptionsPanel: DataDisplayOptionsPanel;
    private cells: GridCell[] = [];
    private selectionManager: SelectionManager | null = null;
    private aspectRatio: number = 1.0;

    constructor(
        cellsContainer: HTMLElement,
        traversalPanel: DataTraversalAndInteractionsPanel,
        displayOptionsPanel: DataDisplayOptionsPanel
    ) {
        this.cellsContainer = cellsContainer;
        this.traversalPanel = traversalPanel;
        this.displayOptionsPanel = displayOptionsPanel;
    }

    calculateGridDimensions(): { rows: number; cols: number; gridCount: number; cellWidth: number; cellHeight: number } {
        const size = this.traversalPanel.getImageWidth();
        const zoom = this.traversalPanel.getMagnification();

        const cellWidth = Math.round(size * zoom);
        // Calculate height based on aspect ratio (width / height = aspect_ratio) -> height = width / aspect_ratio
        const cellHeight = Math.round(cellWidth / this.aspectRatio);

        const containerWidth = this.cellsContainer.clientWidth;

        // Dynamically calculate available height
        const mainContent = this.cellsContainer.closest('.main-content');
        const contentHeader = mainContent?.querySelector('.content-header');
        const bottomBar = document.querySelector('.bottom-bar');

        let availableHeight = window.innerHeight - 150; // Fallback
        if (mainContent && contentHeader) {
            const mainContentHeight = mainContent.clientHeight;
            const headerHeight = (contentHeader as HTMLElement).offsetHeight;
            const bottomBarHeight = (bottomBar as HTMLElement)?.offsetHeight || 0;
            // The grid should fill the remaining space in main-content after the header
            // And before the fixed bottom-bar
            availableHeight = mainContentHeight - headerHeight - bottomBarHeight - 15;
        }

        const cols = Math.max(1, Math.floor(containerWidth / (cellWidth + GRID_GAP)));
        const rows = Math.max(1, Math.floor(availableHeight / (cellHeight + GRID_GAP)));
        const gridCount = rows * cols;

        return { rows, cols, gridCount, cellWidth, cellHeight };
    }

    updateGridLayout(): { rows: number; cols: number; gridCount: number; cellWidth: number; cellHeight: number } {
        const dimensions = this.calculateGridDimensions();
        const { rows, cols, gridCount, cellWidth, cellHeight } = dimensions;

        // Check if we already have the correct number of cells and the correct layout
        const currentCols = parseInt(this.cellsContainer.style.gridTemplateColumns.match(/\d+/)?.[0] || '0');
        if (this.cells.length === gridCount && currentCols === cols && this.cells[0]?.getWidth() === cellWidth) {
            return dimensions;
        }

        // Clear existing cells
        this.cellsContainer.innerHTML = '';
        this.cells = [];

        // Set grid template
        this.cellsContainer.style.gridTemplateColumns = `repeat(${cols}, ${cellWidth}px)`;
        this.cellsContainer.style.gridTemplateRows = `repeat(${rows}, ${cellHeight}px)`;
        this.cellsContainer.style.gap = `${GRID_GAP}px`;

        // Create new cells
        for (let i = 0; i < gridCount; i++) {
            const cell = new GridCell(cellWidth, cellHeight);
            this.cells.push(cell);
            this.cellsContainer.appendChild(cell.getElement());
        }

        return dimensions;
    }

    public setAspectRatio(ratio: number): boolean {
        // Clamp ratio to reasonable bounds to prevent layout explosion
        const clampedRatio = Math.max(0.1, Math.min(ratio, 10));
        if (Math.abs(this.aspectRatio - clampedRatio) > 0.01) {
            this.aspectRatio = clampedRatio;
            return true; // Ratio changed
        }
        return false;
    }

    public getCellbyIndex(index: number): GridCell | null {
        return this.cells[index] || null;
    }

    public getCells(): GridCell[] {
        return this.cells;
    }

    public populateCells(dataRecords: DataRecord[]): void {
        dataRecords.forEach((record, index) => {
            if (this.cells[index]) {
                this.cells[index].populate(
                    record, this.displayOptionsPanel.getDisplayPreferences());
            }
        });
    }

    public clearAllCells() {
        this.cells.forEach(cell => cell.clear());
    }

    public setSelectionManager(selectionManager: SelectionManager): void {
        this.selectionManager = selectionManager;
    }

    public getSelectionManager(): SelectionManager | null {
        return this.selectionManager;
    }
}
