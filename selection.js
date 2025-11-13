
class CellSelectionManager {
  constructor() {
    this.selectedCells = new Set();
    this.isDragging = false;
    this.dragStartCell = null;
    this.contextMenu = null;
    
    this.init();
  }
  
  init() {
    this.createContextMenu();
    this.attachEventListeners();
  }
  
  createContextMenu() {
    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'context-menu';
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="add-tag">Add Tag</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" data-action="discard">Discard</div>
    `;
    document.body.appendChild(this.contextMenu);
    
    // Handle context menu clicks
    this.contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (item) {
        const action = item.dataset.action;
        this.handleContextAction(action);
        this.hideContextMenu();
      }
    });
    
    // Hide context menu on outside click
    document.addEventListener('click', (e) => {
      if (!this.contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });
  }
  
  attachEventListeners() {
    const grid = document.getElementById('cells-grid');
    
    // Mouse down - start selection
    grid.addEventListener('mousedown', (e) => {
      if (e.button === 2) return; // Ignore right click
      
      const cell = e.target.closest('.cell');
      if (!cell) return;
      
      e.preventDefault();
      this.isDragging = true;
      this.dragStartCell = cell;
      
      // Toggle selection on click
      if (!e.shiftKey && !e.ctrlKey) {
        this.clearSelection();
      }
      this.toggleCell(cell);
    });
    
    // Mouse move - drag selection
    grid.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const cell = e.target.closest('.cell');
      if (!cell || cell === this.dragStartCell) return;
      
      this.selectCell(cell);
    });
    
    // Mouse up - end selection
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.dragStartCell = null;
    });
    
    // Context menu
    grid.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      
      e.preventDefault();
      
      // If right-clicked cell is not selected, select only it
      if (!this.selectedCells.has(cell)) {
        this.clearSelection();
        this.selectCell(cell);
      }
      
      this.showContextMenu(e.clientX, e.clientY);
    });
  }
  
  toggleCell(cell) {
    if (this.selectedCells.has(cell)) {
      this.deselectCell(cell);
    } else {
      this.selectCell(cell);
    }
  }
  
  selectCell(cell) {
    this.selectedCells.add(cell);
    cell.classList.add('selected');
  }
  
  deselectCell(cell) {
    this.selectedCells.delete(cell);
    cell.classList.remove('selected');
  }
  
  clearSelection() {
    this.selectedCells.forEach(cell => {
      cell.classList.remove('selected');
    });
    this.selectedCells.clear();
  }
  
  showContextMenu(x, y) {
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.add('visible');
  }
  
  hideContextMenu() {
    this.contextMenu.classList.remove('visible');
  }
  
  handleContextAction(action) {
    const selectedCount = this.selectedCells.size;
    console.log(`Action: ${action} on ${selectedCount} cell(s)`);
    
    switch(action) {
      case 'add-tag':
        console.log('Add tag functionality - to be implemented');
        break;
      case 'discard':
        this.toggleDiscardedState();
        break;
    }
  }
  
  toggleDiscardedState() {
    this.selectedCells.forEach(cell => {
      const isDiscarded = cell.classList.contains('discarded');
      if (isDiscarded) {
        cell.classList.remove('discarded');
        console.log('Restored cell');
      } else {
        cell.classList.add('discarded');
        console.log('Discarded cell');
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cellSelectionManager = new CellSelectionManager();
});
