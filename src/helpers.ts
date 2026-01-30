/**
 * Helpers Module
 * Utility functions for main.ts
 */

// ============================================================================
// Data Conversion Helpers
// ============================================================================

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ============================================================================
// Constants
// ============================================================================

export const DOUBLE_CLICK_THRESHOLD_MS = 1000;
export const SIGNAL_HISTORY_LIMIT = 50000; // keep up to 50k raw points per signal
export const MINUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
export const PLUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

// ============================================================================
// Module-level State
// ============================================================================

export const locallyDiscardedSampleIds = new Set<number>();
export const locallyRestoredSampleIds = new Set<number>();

// ============================================================================
// Chat History Helper
// ============================================================================

export function addChatMessage(text: string, type: 'user' | 'agent', isTyping: boolean = false): HTMLElement | null {
    const list = document.getElementById('chat-history-list');
    const panel = document.getElementById('chat-history-panel');
    if (!list || !panel) return null;

    // Show panel if hidden
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
    }

    // Create item container
    const item = document.createElement('div');
    item.className = `history-item ${type}`;
    if (isTyping) item.classList.add('is-typing');

    // Timestamp
    const meta = document.createElement('span');
    meta.className = 'msg-meta';
    const now = new Date();
    meta.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (isTyping) {
        bubble.textContent = '...';
    } else if (type === 'agent') {
        bubble.innerHTML = text; // Allow HTML for agent responses (markdown-like)
    } else {
        bubble.textContent = text;
    }

    item.appendChild(meta);
    item.appendChild(bubble);
    list.appendChild(item);

    // Scroll to bottom
    list.scrollTop = list.scrollHeight;

    return item;
}

// ============================================================================
// Grid Cell Selection Helpers
// ============================================================================

export function getGridCell(element: HTMLElement): any {
    // Walk up to find a grid cell element
    let current: HTMLElement | null = element;
    while (current && !current.classList.contains('cell') && !current.classList.contains('grid-cell')) {
        current = current.parentElement;
        if (!current) return null;
    }
    if (current && (current as any).__gridCell) {
        return (current as any).__gridCell;
    }
    return null;
}

export function createSelectionBox(): void {
    const grid = document.getElementById('cells-grid') as HTMLElement;
    if (!grid) return;

    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let selectionBox: HTMLElement | null = null;
    const startTime = Date.now();

    const onMouseDown = (e: MouseEvent) => {
        // Don't select if clicking on context menu
        const contextMenu = document.getElementById('context-menu') as HTMLElement;
        if (contextMenu && contextMenu.contains(e.target as Node)) {
            return;
        }

        // Only left-click
        if (e.button !== 0) return;

        // Ignore if ctrl/meta held (this is for multi-select click)
        if (e.ctrlKey || e.metaKey) return;

        // Ignore if clicking on a cell itself (allow single click selection)
        const target = e.target as HTMLElement;
        if (target.closest('.cell, .grid-cell')) return;

        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;

        // Create selection box
        selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        document.body.appendChild(selectionBox);

        clearSelection();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!isSelecting || !selectionBox) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.style.left = x + 'px';
        selectionBox.style.top = y + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';

        // Get cells within bounds - check both .cell and .grid-cell
        const cells = grid.querySelectorAll('.cell, .grid-cell');
        cells.forEach(cell => {
            const rect = (cell as HTMLElement).getBoundingClientRect();
            // Convert page coordinates to client coordinates for comparison
            const selBoxRect = {
                left: x,
                right: x + width,
                top: y,
                bottom: y + height
            };

            // Check if cell intersects with selection box
            const intersects =
                rect.left < selBoxRect.right &&
                rect.right > selBoxRect.left &&
                rect.top < selBoxRect.bottom &&
                rect.bottom > selBoxRect.top;

            if (intersects) {
                addCellToSelection(cell as HTMLElement);
            } else {
                removeCellFromSelection(cell as HTMLElement);
            }
        });
    };

    const onMouseUp = () => {
        isSelecting = false;
        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    grid.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

export function toggleCellSelection(cell: HTMLElement): void {
    if (cell.classList.contains('selected')) {
        removeCellFromSelection(cell);
    } else {
        addCellToSelection(cell);
    }
}

export function addCellToSelection(cell: HTMLElement): void {
    if (!cell.classList.contains('selected')) {
        cell.classList.add('selected');
    }
    const selectedCells = (window as any).selectedCells as Set<HTMLElement> | undefined;
    if (selectedCells) {
        selectedCells.add(cell);
    }
}

export function removeCellFromSelection(cell: HTMLElement): void {
    cell.classList.remove('selected');
    const selectedCells = (window as any).selectedCells as Set<HTMLElement> | undefined;
    if (selectedCells) {
        selectedCells.delete(cell);
    }
}

export function clearSelection(): void {
    const grid = document.getElementById('cells-grid') as HTMLElement;
    if (grid) {
        grid.querySelectorAll('.cell.selected, .grid-cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
    }
    const selectedCells = (window as any).selectedCells as Set<HTMLElement> | undefined;
    if (selectedCells) {
        selectedCells.clear();
    }
}

// ============================================================================
// Context Menu Helpers
// ============================================================================

export function showContextMenu(x: number, y: number): void {
    const contextMenu = document.getElementById('context-menu') as HTMLElement;
    if (!contextMenu) return;

    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('visible');
    console.log('[showContextMenu] Showing menu at', x, y);
}

export function hideContextMenu(): void {
    const contextMenu = document.getElementById('context-menu') as HTMLElement;
    if (contextMenu) {
        contextMenu.classList.remove('visible');
        console.log('[hideContextMenu] Hiding menu');
    }
}

// ============================================================================
// Image Detail Modal Helpers
// ============================================================================

export function applySegmentationToModal(
    baseImageUrl: string,
    gtStat: any | null,
    predStat: any | null,
    showRaw: boolean,
    showGt: boolean,
    showPred: boolean,
    showDiff: boolean,
    classPreferences: any
): void {
    // Get modal image element from DOM
    const modalImage = document.getElementById('modal-image') as HTMLImageElement;
    if (!modalImage) {
        console.warn('Modal image element not found');
        return;
    }

    const img = new Image();
    img.onload = () => {
        const width = img.width;
        const height = img.height;

        if (!width || !height) {
            modalImage.src = baseImageUrl;
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            modalImage.src = baseImageUrl;
            return;
        }

        // 1) Base: raw image or black
        if (showRaw) {
            ctx.drawImage(img, 0, 0, width, height);
        } else {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
        }

        // 2) Use WebGL Renderer for masks
        // Note: Requires SegmentationRenderer to be available globally
        const SegmentationRenderer = (window as any).SegmentationRenderer;
        if (!SegmentationRenderer) {
            console.warn('SegmentationRenderer not available');
            modalImage.src = baseImageUrl;
            return;
        }

        const finalUrl = SegmentationRenderer.getInstance().render(
            img,
            gtStat ? { value: gtStat.value, shape: gtStat.shape } : null,
            predStat ? { value: predStat.value, shape: predStat.shape } : null,
            {
                showRaw,
                showGt,
                showPred,
                showDiff,
                showSplitView: false, // This would need displayOptionsPanel context
                alpha: 0.45,
                classPrefs: classPreferences
            }
        );

        modalImage.src = finalUrl;

        console.log('[Modal] Applied segmentation overlays at', width, 'x', height);
    };

    img.src = baseImageUrl;
}

export function closeImageDetailModal(): void {
    const imageDetailModal = document.getElementById('image-detail-modal') as HTMLElement;
    if (imageDetailModal) {
        imageDetailModal.classList.remove('visible');
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// ============================================================================
// Painter/Tagging Helpers
// ============================================================================

export function ensureTagMetadataEnabled(): void {
    const enableTagsCheckbox = document.getElementById('enable-tags-checkbox') as HTMLInputElement;
    if (enableTagsCheckbox && !enableTagsCheckbox.checked) {
        console.warn('Tags metadata not enabled; cannot tag samples');
        enableTagsCheckbox.click();
        console.warn('Enabled tags metadata');
    }
}

export function getRecordOrigin(record: any): string {
    const originStat = record.dataStats.find((s: any) => s.name === 'origin');
    if (!originStat) return '';

    // Try to get value first
    let origin = '';
    if (originStat.value) {
        origin = originStat.value instanceof Array ? originStat.value[0] : originStat.value;
    }

    // Fall back to valueString if value is empty or null
    if (!origin && originStat.valueString) {
        origin = originStat.valueString;
    }

    return String(origin || '');
}

// Helper to manage visual state of active brush
export function setActiveBrush(tag: string): void {
    // This function must be called with leftPanel context available
    const leftPanel = (window as any).leftPanelModule;
    if (!leftPanel) {
        console.warn('setActiveBrush: leftPanel module not available');
        return;
    }

    const activeBrushTags = leftPanel.getActiveBrushTags();
    if (activeBrushTags.has(tag)) {
        activeBrushTags.delete(tag);
    } else {
        activeBrushTags.add(tag);
    }

    // Update visual state of chips
    const chips = document.querySelectorAll('.tag-chip');
    chips.forEach(chip => {
        const t = (chip as HTMLElement).dataset.tag;
        const activeBrushTags = leftPanel.getActiveBrushTags();
        if (t && activeBrushTags.has(t)) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

// Update unique tags in painter mode and UI
export function updateUniqueTags(tags: string[]): void {
    // Filter out None, null, undefined, empty strings, and whitespace-only strings
    const uniqueTags = (tags || []).filter(t => t && t.trim() !== '' && t !== 'None');

    // 1. Update existing tags datalist (for tagging modal)
    const datalist = document.getElementById('existing-tags');
    if (datalist) {
        datalist.innerHTML = uniqueTags.map(t => `<option value="${t}">`).join('');
    }

    // 2. Update Painter Mode Tag List (Chips)
    const tagsContainer = document.getElementById('painter-tags-list');
    if (tagsContainer) {
        // Preserve the inline input and manually added tags (with data-manual attribute)
        const inlineInput = tagsContainer.querySelector('.inline-tag-input');
        const manualTags = Array.from(tagsContainer.querySelectorAll('[data-manual="true"]')) as HTMLElement[];

        // Store references to manual tags to preserve them
        const manualTagTexts = new Set(manualTags.map(t => t.textContent));

        // Clear only the auto-generated chips (those without data-manual)
        Array.from(tagsContainer.children).forEach(child => {
            if (child !== inlineInput && !(child as any).dataset?.manual) {
                child.remove();
            }
        });

        if (uniqueTags.length > 0) {
            // Sort tags if needed, they usually come sorted
            uniqueTags.forEach(tag => {
                // Don't recreate if it's a manual tag that still exists
                if (manualTagTexts.has(tag)) return;

                const chip = document.createElement('div');
                chip.className = 'tag-chip';
                chip.dataset.manual = 'false'; // Mark as auto-generated
                const leftPanel = (window as any).leftPanelModule;
                const activeBrushTags = leftPanel ? leftPanel.getActiveBrushTags() : new Set();
                if (activeBrushTags.has(tag)) chip.classList.add('active');
                chip.dataset.tag = tag;
                chip.textContent = tag;

                chip.onclick = (e) => {
                    setActiveBrush(tag);
                };

                // Insert before the input (if it exists), or append
                if (inlineInput) {
                    tagsContainer.insertBefore(chip, inlineInput);
                } else {
                    tagsContainer.appendChild(chip);
                }
            });
        }
    }
}


// ============================================================================
// State Tracking Helpers
// ============================================================================

export function addLocallyDiscardedSample(sampleId: number): void {
    locallyDiscardedSampleIds.add(sampleId);
    locallyRestoredSampleIds.delete(sampleId);
}

export function addLocallyRestoredSample(sampleId: number): void {
    locallyRestoredSampleIds.add(sampleId);
    locallyDiscardedSampleIds.delete(sampleId);
}

export function isLocallyDiscarded(sampleId: number): boolean {
    return locallyDiscardedSampleIds.has(sampleId);
}

export function isLocallyRestored(sampleId: number): boolean {
    return locallyRestoredSampleIds.has(sampleId);
}
