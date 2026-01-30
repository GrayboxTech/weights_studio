
import { GridCell } from "./GridCell";

export class SelectionManager {
    private selectedCells: Set<GridCell> = new Set();
    private container: HTMLElement;
    private isSelecting: boolean = false;
    private lastSelectedCell: GridCell | null = null;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private selectionBox: HTMLElement | null = null;
    private gridElement: HTMLElement | null = null;
    private dragThreshold = 5;
    private hasMoved = false;
    private clickedCell: GridCell | null = null; // Track the cell clicked on mousedown

    constructor(container: HTMLElement) {
        this.container = container;
        this.gridElement = this.container.querySelector('.grid');
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.gridElement.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    private createSelectionBox(): void {
        if (!this.selectionBox) {
            this.selectionBox = document.createElement('div');
            this.selectionBox.style.position = 'absolute';
            this.selectionBox.style.border = '1px dashed #adcef3ff';
            this.selectionBox.style.backgroundColor = 'rgba(3, 97, 198, 0.2)';
            this.selectionBox.style.pointerEvents = 'none';
            this.selectionBox.style.zIndex = '1000';
            document.body.appendChild(this.selectionBox);
        }
    }

    public addCellToSelection(cell: GridCell): void {
        this.selectedCells.add(cell);
        cell.getElement().classList.add('selected');
        this.logSelectionState('addCellToSelection');
    }

    public removeCellFromSelection(cell: GridCell): void {
        this.selectedCells.delete(cell);
        cell.getElement().classList.remove('selected');
        this.logSelectionState('removeCellFromSelection');
    }

    public toggleCellSelection(cell: GridCell): void {
        if (this.selectedCells.has(cell)) {
            this.removeCellFromSelection(cell);
        } else {
            this.addCellToSelection(cell);
        }
    }

    public clearSelection(): void {
        console.log('[SelectionManager] Clearing selection, current size:', this.selectedCells.size);
        this.selectedCells.forEach(cell => {
            cell.getElement().classList.remove('selected');
        });
        this.selectedCells.clear();
        this.lastSelectedCell = null;
        this.logSelectionState('clearSelection');
    }

    public getSelectedCells(): GridCell[] {
        return Array.from(this.selectedCells);
    }

    public hasSelection(): boolean {
        return this.selectedCells.size > 0;
    }

    public selectRange(startCell: GridCell, endCell: GridCell, allCells: GridCell[]): void {
        const startIndex = allCells.indexOf(startCell);
        const endIndex = allCells.indexOf(endCell);

        if (startIndex === -1 || endIndex === -1) return;

        const [min, max] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        for (let i = min; i <= max; i++) {
            this.addCellToSelection(allCells[i]);
        }

        this.logSelectionState('selectRange');
    }

    public setLastSelectedCell(cell: GridCell): void {
        this.lastSelectedCell = cell;
    }

    public getLastSelectedCell(): GridCell | null {
        return this.lastSelectedCell;
    }

    private logSelectionState(caller: string): void {
        const selectedSampleIds = Array.from(this.selectedCells)
            .map(cell => cell.getRecord()?.sampleId)
            .filter(id => id !== undefined);

        const visuallySelected = Array.from(this.container.querySelectorAll('.cell.selected'))
            .map(el => {
                const sampleIdEl = el.querySelector('.sample-id');
                return sampleIdEl ? parseInt(sampleIdEl.textContent || '-1', 10) : -1;
            })
            .filter(id => id !== -1);

        console.log(`[SelectionManager.${caller}]`, {
            selectedCellsCount: this.selectedCells.size,
            selectedSampleIds: selectedSampleIds,
            visuallySelectedCount: visuallySelected.length,
            visuallySelectedIds: visuallySelected,
            mismatch: selectedSampleIds.length !== visuallySelected.length ||
                !selectedSampleIds.every(id => visuallySelected.includes(id))
        });
    }

    public logCurrentState(): void {
        this.logSelectionState('logCurrentState');
    }

    private handleMouseDown(e: MouseEvent): void {
        // Ignore right-clicks
        if (e.button === 2) {
            return;
        }

        const target = e.target as HTMLElement;
        const cellElement = target.closest('.cell') as HTMLElement | null;

        this.hasMoved = false;
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.clickedCell = null;

        if (cellElement) {
            const cell = this.getCellFromElement(cellElement);
            if (cell) {
                e.preventDefault();
                this.clickedCell = cell;

                // Ctrl/Cmd+Click: toggle selection
                if (e.ctrlKey || e.metaKey) {
                    this.toggleCellSelection(cell);
                    this.isDragging = false;
                    return;
                }

                // If clicking on already selected cell, don't clear yet
                // Wait to see if it's a drag or just a click
                if (this.selectedCells.has(cell)) {
                    // Don't do anything yet, wait for mouseup
                    return;
                }

                // Regular click on unselected cell: clear and select this cell
                this.clearSelection();
                this.addCellToSelection(cell);
            }
        } else {
            // Clicking on empty space: clear selection and prepare for box select
            if (!e.ctrlKey && !e.metaKey) {
                this.clearSelection();
            }
        }

        this.createSelectionBox();
        this.selectionBox!.style.left = `${this.startX}px`;
        this.selectionBox!.style.top = `${this.startY}px`;
        this.selectionBox!.style.width = '0px';
        this.selectionBox!.style.height = '0px';
        this.selectionBox!.style.display = 'none';
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this.isDragging || !this.selectionBox) return;

        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = Math.abs(currentX - this.startX);
        const deltaY = Math.abs(currentY - this.startY);

        // Check if we've moved beyond threshold
        if (!this.hasMoved && (deltaX > this.dragThreshold || deltaY > this.dragThreshold)) {
            this.hasMoved = true;
            this.selectionBox.style.display = 'block';

            // If we started on a selected cell and now we're dragging, clear selection
            if (this.clickedCell && this.selectedCells.has(this.clickedCell)) {
                this.clearSelection();
            }
        }

        if (this.hasMoved) {
            const x = Math.min(this.startX, currentX);
            const y = Math.min(this.startY, currentY);
            const width = deltaX;
            const height = deltaY;

            this.selectionBox.style.left = `${x}px`;
            this.selectionBox.style.top = `${y}px`;
            this.selectionBox.style.width = `${width}px`;
            this.selectionBox.style.height = `${height}px`;

            const selectionRect = this.selectionBox.getBoundingClientRect();

            for (const cellElement of this.gridElement.children) {
                const cellElem = cellElement as HTMLElement;
                const cellRect = cellElem.getBoundingClientRect();

                const isIntersecting =
                    selectionRect.left < cellRect.right &&
                    selectionRect.right > cellRect.left &&
                    selectionRect.top < cellRect.bottom &&
                    selectionRect.bottom > cellRect.top;

                const cell = this.getCellFromElement(cellElem);
                if (!cell) continue;

                if (isIntersecting) {
                    this.addCellToSelection(cell);
                } else if (!e.ctrlKey && !e.metaKey) {
                    this.removeCellFromSelection(cell);
                }
            }
        }
    }

    private handleMouseUp(e: MouseEvent): void {
        if (!this.isDragging) return;

        this.isDragging = false;

        if (this.selectionBox) {
            this.selectionBox.style.display = 'none';
        }

        // If we didn't move and clicked on a cell
        if (!this.hasMoved && this.clickedCell) {
            // If it was already selected, keep it selected (don't toggle)
            // If it wasn't selected, it was already added in mousedown
            if (!this.selectedCells.has(this.clickedCell)) {
                this.clearSelection();
                this.addCellToSelection(this.clickedCell);
            }
        }

        this.hasMoved = false;
        this.clickedCell = null;
    }

    private getCellFromElement(element: HTMLElement): GridCell | null {
        return (element as any).__gridCell || null;
    }

    public registerCell(cell: GridCell): void {
        (cell.getElement() as any).__gridCell = cell;
    }

    public toggleCell(cell: GridCell): void {
        if (this.selectedCells.has(cell)) {
            this.removeCellFromSelection(cell);
        } else {
            this.addCellToSelection(cell);
        }
    }

    public getIsDragging(): boolean {
        return this.isDragging;
    }

    public getStartPosition(): { x: number; y: number } {
        return { x: this.startX, y: this.startY };
    }

    public destroy(): void {
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }
}
