/**
 * Left Panel Manager
 * Handles inspector panel, metadata, painter mode, and tagging
 */

export interface PainterState {
    isPainterMode: boolean;
    isPainterRemoveMode: boolean;
    activeBrushTags: Set<string>;
}

let painterState: PainterState = {
    isPainterMode: false,
    isPainterRemoveMode: false,
    activeBrushTags: new Set(),
};

let uniqueTags: string[] = [];

export function initializeLeftPanel(): void {
    initializePainterMode();
    initializeTags();
}

function initializePainterMode(): void {
    const painterToggle = document.getElementById('painter-toggle') as HTMLInputElement;
    const painterNewTagBtn = document.getElementById('painter-new-tag') as HTMLButtonElement;

    if (painterToggle) {
        painterToggle.addEventListener('change', () => {
            painterState.isPainterMode = painterToggle.checked;
            const modeSwitcherContainer = document.getElementById('mode-switcher-container');
            if (modeSwitcherContainer) {
                modeSwitcherContainer.style.display = painterState.isPainterMode ? 'flex' : 'none';
            }
        });
    }

    if (painterNewTagBtn) {
        painterNewTagBtn.addEventListener('click', addNewTag);
    }

    const modeAddBtn = document.getElementById('mode-add') as HTMLButtonElement;
    const modeRemoveBtn = document.getElementById('mode-remove') as HTMLButtonElement;

    if (modeAddBtn && modeRemoveBtn) {
        modeAddBtn.addEventListener('click', () => {
            painterState.isPainterRemoveMode = false;
            modeAddBtn.classList.add('active');
            modeAddBtn.classList.remove('remove-mode');
            modeRemoveBtn.classList.remove('active', 'remove-mode');
        });

        modeRemoveBtn.addEventListener('click', () => {
            painterState.isPainterRemoveMode = true;
            modeRemoveBtn.classList.add('active', 'remove-mode');
            modeAddBtn.classList.remove('active');
        });
    }
}

function initializeTags(): void {
    // Initialize empty tags list
    uniqueTags = [];
    painterState.activeBrushTags.clear();
}

export function getPainterState(): PainterState {
    return painterState;
}

export function getPainterMode(): boolean {
    return painterState.isPainterMode;
}

export function getPainterRemoveMode(): boolean {
    return painterState.isPainterRemoveMode;
}

export function getActiveBrushTags(): Set<string> {
    return painterState.activeBrushTags;
}

export function setActiveBrush(tag: string): void {
    painterState.activeBrushTags.clear();
    painterState.activeBrushTags.add(tag);
    updateTagChipsUI();
}

export function updateUniqueTags(tags: string[]): void {
    // Filter out None, null, undefined, empty strings, and whitespace-only strings
    uniqueTags = (tags || []).filter(t => t && t.trim() !== '' && t !== 'None');

    // Update datalist for tagging modal
    const datalist = document.getElementById('existing-tags');
    if (datalist) {
        datalist.innerHTML = uniqueTags.map(t => `<option value="${t}">`).join('');
    }

    updateTagChipsUI();
}

function updateTagChipsUI(): void {
    const tagsContainer = document.getElementById('painter-tags-list');
    if (!tagsContainer) return;

    // Preserve the inline input and manually added tags
    const inlineInput = tagsContainer.querySelector('.inline-tag-input');
    const manualTags = Array.from(tagsContainer.querySelectorAll('[data-manual="true"]')) as HTMLElement[];
    const manualTagTexts = new Set(manualTags.map(t => t.textContent));

    // Clear only auto-generated chips
    Array.from(tagsContainer.children).forEach(child => {
        if (child !== inlineInput && !(child as any).dataset?.manual) {
            child.remove();
        }
    });

    if (uniqueTags.length > 0) {
        uniqueTags.forEach(tag => {
            if (manualTagTexts.has(tag)) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.dataset.manual = 'false';
            if (painterState.activeBrushTags.has(tag)) chip.classList.add('active');
            chip.dataset.tag = tag;
            chip.textContent = tag;

            chip.onclick = () => {
                setActiveBrush(tag);
            };

            if (inlineInput) {
                tagsContainer.insertBefore(chip, inlineInput);
            } else {
                tagsContainer.appendChild(chip);
            }
        });
    }
}

function addNewTag(): void {
    const newTagInput = document.getElementById('painter-new-tag-input') as HTMLInputElement;
    if (!newTagInput) return;

    const newTag = newTagInput.value.trim();
    if (newTag) {
        if (!uniqueTags.includes(newTag)) {
            updateUniqueTags([...uniqueTags, newTag].sort());
        }

        // Create manual tag chip
        const tagsContainer = document.getElementById('painter-tags-list');
        if (tagsContainer) {
            let existingChip = Array.from(tagsContainer.querySelectorAll('.tag-chip')).find(
                chip => (chip as HTMLElement).textContent === newTag
            );

            if (!existingChip) {
                const chip = document.createElement('div');
                chip.className = 'tag-chip';
                chip.dataset.manual = 'true';
                chip.dataset.tag = newTag;
                chip.textContent = newTag;
                chip.onclick = () => {
                    setActiveBrush(newTag);
                };

                const inlineInput = tagsContainer.querySelector('.inline-tag-input');
                if (inlineInput) {
                    tagsContainer.insertBefore(chip, inlineInput);
                } else {
                    tagsContainer.appendChild(chip);
                }
            }
        }

        setActiveBrush(newTag);
        newTagInput.value = '';
    }
}

export function getUniqueTags(): string[] {
    return [...uniqueTags];
}

export function togglePainterMode(): void {
    const painterToggle = document.getElementById('painter-toggle') as HTMLInputElement;
    if (painterToggle) {
        painterToggle.checked = !painterToggle.checked;
        painterToggle.dispatchEvent(new Event('change'));
    }
}

export function ensureTagMetadataEnabled(): void {
    // This would be called from the display options panel
    // to ensure tags are enabled as a metadata field
    const event = new CustomEvent('ensureTagMetadata');
    document.dispatchEvent(event);
}
