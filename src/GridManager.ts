
import { GridCell } from "./GridCell";
import { DataRecord } from "./data_service";
import { DataDisplayOptionsPanel } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { SelectionManager } from "./SelectionManager";

const GRID_GAP = 4;
const CONTROLS_HEIGHT = 100;


export class GridManager {
    private cellsContainer: HTMLElement;
    private traversalPanel: DataTraversalAndInteractionsPanel;
    private displayOptionsPanel: DataDisplayOptionsPanel;
    private cells: GridCell[] = [];
    private selectionManager: SelectionManager | null = null;

    constructor(
            cellsContainer: HTMLElement,
            traversalPanel: DataTraversalAndInteractionsPanel,
            displayOptionsPanel: DataDisplayOptionsPanel
        ) {
        this.cellsContainer = cellsContainer;
        this.traversalPanel = traversalPanel;
        this.displayOptionsPanel = displayOptionsPanel;
    }

    calculateGridDimensions(): {rows: number; cols: number; gridCount: number; cellSize: number } {
        const size = this.traversalPanel.getImageWidth();
        const zoom = this.traversalPanel.getMagnification();

        const effectiveCellSize = Math.round(size * zoom);
        const containerWidth = this.cellsContainer.clientWidth;
        const containerHeight = window.innerHeight - CONTROLS_HEIGHT;

        const cols = Math.max(1, Math.floor(containerWidth / (effectiveCellSize + GRID_GAP)));
        const rows = Math.max(1, Math.floor(containerHeight / (effectiveCellSize + GRID_GAP)));
        const gridCount = rows * cols;

        return { rows, cols, gridCount, cellSize: effectiveCellSize };
    }

    updateGridLayout(): { rows: number; cols: number; gridCount: number; cellSize: number } {
        const dimensions = this.calculateGridDimensions();
        const { rows, cols, gridCount, cellSize } = dimensions;

        // Clear existing cells
        this.cellsContainer.innerHTML = '';
        this.cells = [];

        // Set grid template
        this.cellsContainer.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
        this.cellsContainer.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
        this.cellsContainer.style.gap = `${GRID_GAP}px`;

        // Create new cells
        for (let i = 0; i < gridCount; i++) {
            const cell = new GridCell(cellSize, cellSize);
            this.cells.push(cell);
            this.cellsContainer.appendChild(cell.getElement());
        }

        return dimensions;
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
