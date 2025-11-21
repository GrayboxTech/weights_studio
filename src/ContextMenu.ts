
import { GridCell } from "./GridCell";
import { SelectionManager } from "./SelectionManager";

export interface ContextMenuOptions {
    onDiscard?: (cells: GridCell[]) => void;
    onAddTag?: (cells: GridCell[], tag: string) => void;
}

export class ContextMenu {
    private menu: HTMLElement;
    private selectionManager: SelectionManager;
    private options: ContextMenuOptions;
    private gridElement: HTMLElement;
    private isVisible: boolean = false;

    constructor(gridElement: HTMLElement, selectionManager: SelectionManager, options: ContextMenuOptions = {}) {
        this.gridElement = gridElement;
        this.selectionManager = selectionManager;
        this.options = options;
        this.menu = this.getOrCreateMenuElement();
        this.setupEventListeners();
    }

    private getOrCreateMenuElement(): HTMLElement {
        let menu = document.getElementById('context-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'context-menu';
            menu.className = 'context-menu';
            menu.style.display = 'none';
            menu.innerHTML = `
                <div class="context-menu-item" data-action="discard">Discard</div>
                <div class="context-menu-item" data-action="add-tag">Add Tag</div>
            `;
            document.body.appendChild(menu);
        }
        return menu;
    }

    private setupEventListeners(): void {
        // Handle right-click on grid - use capture phase to get it before SelectionManager
        this.gridElement.addEventListener('contextmenu', (e) => this.handleContextMenu(e), true);
        
        // Handle clicks on menu items
        this.menu.addEventListener('click', (e) => this.handleMenuClick(e));
        
        // Close menu on any left click outside
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                this.handleDocumentClick(e);
            }
        });
        
        // Close menu on right-click outside
        document.addEventListener('contextmenu', (e) => this.handleDocumentContextMenu(e), true);
    }

    private handleContextMenu(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const cellElement = target.closest('.cell') as HTMLElement | null;

        if (cellElement) {
            e.preventDefault();
            e.stopPropagation();
            
            const cell = (cellElement as any).__gridCell as GridCell | null;
            
            if (cell) {
                // If right-clicking on a non-selected cell, select only that cell
                if (!this.selectionManager.getSelectedCells().includes(cell)) {
                    this.selectionManager.clearSelection();
                    this.selectionManager.addCellToSelection(cell);
                }

                // Show context menu
                this.showMenu(e.clientX, e.clientY);
            }
        }
    }

    private handleMenuClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;
        
        if (action) {
            switch (action) {
                case 'discard':
                    this.handleDiscard();
                    break;
                case 'add-tag':
                    if (this.options.onAddTag) {
                        const tag = prompt('Enter tag:');
                        if (tag) {
                            this.options.onAddTag(this.selectionManager.getSelectedCells(), tag);
                        }
                    }
                    break;
            }
            
            this.hideMenu();
        }
    }

    private handleDocumentClick(e: MouseEvent): void {
        if (!this.isVisible) return;
        
        const target = e.target as HTMLElement;
        // Close menu if clicking outside of it
        if (!target.closest('.context-menu')) {
            this.hideMenu();
        }
    }

    private handleDocumentContextMenu(e: MouseEvent): void {
        if (!this.isVisible) return;
        
        const target = e.target as HTMLElement;
        // Close menu if right-clicking outside of it
        if (!target.closest('.context-menu') && !target.closest('.cell')) {
            this.hideMenu();
        }
    }

    private async handleDiscard(): Promise<void> {
        const selectedCells = this.selectionManager.getSelectedCells();
        
        // Log before discarding
        console.log('[ContextMenu] About to discard cells:');
        this.selectionManager.logCurrentState();
        
        if (selectedCells.length > 0 && this.options.onDiscard) {
            await this.options.onDiscard(selectedCells);
            this.selectionManager.clearSelection();
        }
        this.hideMenu();
    }

    private showMenu(x: number, y: number): void {
        // Ensure menu doesn't go off screen
        const menuWidth = 150; // approximate
        const menuHeight = 80; // approximate
        
        const finalX = Math.min(x, window.innerWidth - menuWidth);
        const finalY = Math.min(y, window.innerHeight - menuHeight);
        
        this.menu.style.left = `${finalX}px`;
        this.menu.style.top = `${finalY}px`;
        this.menu.style.display = 'block';
        this.isVisible = true;
    }

    private hideMenu(): void {
        this.menu.style.display = 'none';
        this.isVisible = false;
    }

    public destroy(): void {
        this.menu.remove();
    }
}
