// ========== Split Checkboxes Logic (merged with color pickers) ==========
let splitVisibility: Record<string, boolean> = {};

function renderSplitCheckboxes(splits: string[]) {
    const slot = document.getElementById('split-checkboxes-slot');
    if (!slot) return;
    slot.innerHTML = '';
    splits.forEach((split, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'split-color-picker-wrapper';
        // Label
        const label = document.createElement('span');
        label.className = 'chip';
        label.textContent = split;
        // Color picker
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'color-picker';
        colorInput.id = `${split}-color`;
        const savedColor = localStorage.getItem(`${split}-color`);
        colorInput.value = savedColor || generateSplitColor(split, index, splits.length);
        colorInput.addEventListener('input', () => {
            localStorage.setItem(`${split}-color`, colorInput.value);
            fetchAndDisplaySamples();
        });
        wrapper.appendChild(label);
        wrapper.appendChild(colorInput);
        slot.appendChild(wrapper);
    });
}

// Patch fetchAndCreateSplitColorPickers to also render split checkboxes
const origFetchAndCreateSplitColorPickers = fetchAndCreateSplitColorPickers;
fetchAndCreateSplitColorPickers = async function() {
    await origFetchAndCreateSplitColorPickers.apply(this, arguments);
    if (Array.isArray(availableSplits) && availableSplits.length > 0) {
        renderSplitCheckboxes(availableSplits);
    }
}

// Patch fetchAndDisplaySamples to filter by split checkboxes
const origFetchAndDisplaySamples = fetchAndDisplaySamples;
fetchAndDisplaySamples = async function() {
    const activeSplits = Object.keys(splitVisibility).filter(k => splitVisibility[k] !== false);
    if (activeSplits.length === 0 || activeSplits.length === Object.keys(splitVisibility).length) {
        return await origFetchAndDisplaySamples.apply(this, arguments);
    }
    await origFetchAndDisplaySamples.apply(this, arguments);
    const gridCells = document.querySelectorAll('.cell');
    gridCells.forEach(cell => {
        const record = cell.__dataRecord || {};
        const split = record.origin || record.split || record.loader || '';
        if (activeSplits.includes(split)) {
            cell.style.display = '';
        } else {
            cell.style.display = 'none';
        }
    });
}

// ========== Popup/modal dismiss on outside click ==========
document.addEventListener('mousedown', (e) => {
    // Dismiss modal
    const modal = document.getElementById('image-detail-modal');
    if (modal && modal.classList.contains('visible')) {
        if (e.target && (e.target as HTMLElement).classList.contains('modal-backdrop')) {
            modal.classList.remove('visible');
        }
    }
    // Dismiss grid settings popup (collapses if open and click outside)
    const gridSettings = document.getElementById('view-controls');
    const gridSettingsToggle = document.getElementById('grid-settings-toggle');
    if (gridSettings && !gridSettings.classList.contains('collapsed')) {
        if (!gridSettings.contains(e.target as Node) && e.target !== gridSettingsToggle) {
            gridSettings.classList.add('collapsed');
        }
    }
    // Unselect grid selection if click outside grid/cell or details
    const grid = document.getElementById('cells-grid');
    const details = document.getElementById('details-body');
    if (grid && !grid.contains(e.target as Node) && (!details || !details.contains(e.target as Node))) {
        grid.classList.add('unselecting');
        setTimeout(() => grid.classList.remove('unselecting'), 100);
    }
    // Dismiss context menu if open
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu && ctxMenu.classList.contains('visible')) {
        if (!ctxMenu.contains(e.target as Node)) {
            ctxMenu.classList.remove('visible');
        }
    }
});

// ========== Agent Llama Availability Check ==========
async function freezeInputIfAgentUnavailable() {
    // Fetch agent status and freeze input if not alive
    let available = false;
    let statusText = '';
    try {
        // Use gRPC SDK to check agent health
        const resp = await dataClient.checkAgentHealth({}).response;
        // The proto may have isAvailable or available or status fields
        available = !!(resp.isAvailable ?? resp.available);
        statusText = resp.status || resp.message || '';
    } catch (e) {
        // If the call fails, treat as unavailable
        available = false;
        statusText = '';
    }
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const btn = document.getElementById('chat-send') as HTMLButtonElement;
    if (!input || !btn) return;
    if (!available) {
        input.disabled = true;
        btn.disabled = true;
        input.value = '';
        input.placeholder = 'Agent is not available';
        input.style.background = '#444';
        input.style.color = '#bbb';
        btn.style.background = '#444';
        btn.style.color = '#bbb';
        btn.style.cursor = 'not-allowed';
    } else {
        input.disabled = false;
        btn.disabled = false;
        input.placeholder = 'drop 50% of the samples with losses between 1.4 and 1.9';
        input.style.background = '';
        input.style.color = '';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.cursor = '';
    }
}

// Call on every refresh and on load
setInterval(freezeInputIfAgentUnavailable, 15000);
document.addEventListener('DOMContentLoaded', freezeInputIfAgentUnavailable);

import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { ExperimentServiceClient } from "./experiment_service.client";
import {
    DataEditsRequest,
    DataEditsResponse,
    DataQueryRequest,
    DataQueryResponse,
    SampleEditType,
    DataSamplesRequest,
    DataSamplesResponse,
    TrainerCommand,
    HyperParameterCommand,
    HyperParameters,
    Empty,
} from "./experiment_service";
import { DataDisplayOptionsPanel, SplitColors } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { GridManager } from "./GridManager";
import { SelectionManager } from "./SelectionManager";
import { ContextMenu } from "./ContextMenu";
import { GridCell } from "./GridCell";
import { initializeDarkMode } from "./darkMode";
import { ClassPreference, GridCell } from "./GridCell";
import { SegmentationRenderer } from "./SegmentationRenderer";


const SERVER_URL = "http://localhost:8080";

const transport = new GrpcWebFetchTransport(
    { baseUrl: SERVER_URL, format: "text", });

const dataClient = new ExperimentServiceClient(transport);
const traversalPanel = new DataTraversalAndInteractionsPanel();

let cellsContainer: HTMLElement | null;
let displayOptionsPanel: DataDisplayOptionsPanel | null = null;
let gridManager: GridManager;
let selectionManager: SelectionManager;
let contextMenuManager: ContextMenu;
let isTraining = false; // local UI state, initialized from server on load (default to paused)
let inspectorOpen = true;
let inspectorContainer: HTMLElement | null = null;
let inspectorPanel: HTMLElement | null = null;
let trainingStatePill: HTMLElement | null = null;
let trainingSummary: HTMLElement | null = null;
let detailsToggle: HTMLButtonElement | null = null;
let detailsBody: HTMLElement | null = null;
let uniqueTags: string[] = [];

let fetchTimeout: any = null;
let currentFetchRequestId = 0;


// Global state for available splits
let availableSplits: string[] = [];

// Default color mapping
const DEFAULT_SPLIT_COLORS: Record<string, string> = {
    'train': '#1976D2',      // Blue
    'test': '#388E3C',       // Green
    'eval': '#388E3C',       // Green (alias for test)
    'val': '#D32F2F',        // Red
    'validation': '#D32F2F'  // Red (alias for val)
};

function generateSplitColor(splitName: string, index: number, total: number): string {
    const lowerName = splitName.toLowerCase();

    // Check if the split name contains keywords for default colors
    if (lowerName.includes('train')) {
        return DEFAULT_SPLIT_COLORS['train'];  // Blue
    }
    if (lowerName.includes('val')) {
        return DEFAULT_SPLIT_COLORS['val'];  // Red
    }
    if (lowerName.includes('test') || lowerName.includes('eval')) {
        return DEFAULT_SPLIT_COLORS['test'];  // Green
    }

    // For additional splits beyond the defaults, generate random colors
    // Avoid red (0°/360°), green (120°), and blue (240°)
    // Safe ranges: 30-90 (orange/yellow), 150-210 (cyan), 270-330 (purple/magenta)
    const safeRanges = [
        [30, 90],    // Orange to yellow
        [150, 210],  // Cyan to teal
        [270, 330]   // Purple to magenta
    ];

    // Pick a random safe range
    const rangeIndex = Math.floor(Math.random() * safeRanges.length);
    const [minHue, maxHue] = safeRanges[rangeIndex];

    // Generate random hue within the safe range
    const hue = Math.floor(Math.random() * (maxHue - minHue + 1)) + minHue;
    const saturation = 65 + Math.floor(Math.random() * 15); // 65-80%
    const lightness = 40 + Math.floor(Math.random() * 15);  // 40-55%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

async function fetchAndCreateSplitColorPickers(): Promise<void> {
    try {
        // Gracefully handle older SDKs without GetDataSplits
        if (typeof (dataClient as any).getDataSplits !== 'function') {
            console.warn('GetDataSplits RPC not available on client; falling back to defaults');
            availableSplits = ['train', 'eval'];
            return;
        }

        const response = await dataClient.getDataSplits({}).response;

        if (response.success && response.splitNames.length > 0) {
            availableSplits = response.splitNames;

            // Find the split colors container in the HTML
            const splitColorsContainer = document.querySelector('.split-colors .row-controls');
            if (!splitColorsContainer) {
                console.warn('Split colors container not found');
                return;
            }

            // Clear existing color pickers
            splitColorsContainer.innerHTML = '';

            // Create color picker for each split
            availableSplits.forEach((split, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'color-picker-wrapper';

                const label = document.createElement('span');
                label.className = 'chip';
                label.textContent = split.charAt(0).toUpperCase() + split.slice(1);

                const input = document.createElement('input');
                input.type = 'color';
                input.id = `${split}-color`;
                input.className = 'color-picker';

                // Restore from localStorage or use default/generated color
                const savedColor = localStorage.getItem(`${split}-color`);
                input.value = savedColor || generateSplitColor(split, index, availableSplits.length);

                // Save to localStorage on change and update display
                input.addEventListener('input', () => {
                    localStorage.setItem(`${split}-color`, input.value);
                    updateDisplayOnlyDebounced();
                });

                wrapper.appendChild(label);
                wrapper.appendChild(input);
                splitColorsContainer.appendChild(wrapper);
            });

            console.log(`Created color pickers for splits: ${availableSplits.join(', ')}`);
        } else {
            console.warn('No splits returned from server, using defaults');
            availableSplits = ['train', 'eval'];
        }
    } catch (error) {
        console.error('Failed to fetch data splits:', error);
        // Fallback to defaults
        availableSplits = ['train', 'eval'];
    }
}

function getSplitColors(): SplitColors {
    const colors: SplitColors = {};

    // Build a case-insensitive map and include common aliases
    const aliasPairs: Array<[string, string]> = [
        ["eval", "test"],
        ["test", "eval"],
        ["test_loader", "eval"],
        ["eval_loader", "test"],
        ["val", "validation"],
        ["val_loader", "val"],
        ["validation", "val"],
        ["validation_loader", "val"],
        ["train_loader", "train"],
        ["training_loader", "train"],
    ];

    availableSplits.forEach((split, index) => {
        const key = split.toLowerCase();
        const inputId = `${split}-color`;
        const colorInput = document.getElementById(inputId) as HTMLInputElement;

        const color = colorInput?.value
            ? colorInput.value
            : generateSplitColor(split, index, availableSplits.length);

        // Primary key (lowercased)
        colors[key] = color;

        // Add alias entries if applicable
        for (const [from, to] of aliasPairs) {
            if (key === from && !(to in colors)) {
                colors[to] = color;
            }
        }
    });

    return colors;
}

async function fetchSamples(request: DataSamplesRequest): Promise<DataSamplesResponse> {
    try {
        const response = await dataClient.getDataSamples(request).response;
        return response;
    } catch (error) {
        if (error instanceof RpcError) {
            console.error(
                `gRPC Error fetching samples (Method: ${error.methodName}, Service: ${error.serviceName}): ${error.message}`,
                `This may be due to a mismatch between the client and server. Please check the server logs and ensure the gRPC service is running and the method name is correct.`,
                `Original error:`, error
            );
        } else {
            console.error("Error fetching samples:", error);
        }
        throw error; // Re-throw to allow callers to handle the failure.
    }
}

async function fetchAndDisplaySamples() {
    if (!displayOptionsPanel) {
        console.warn('displayOptionsPanel not initialized');
        return;
    }

    const start = traversalPanel.getStartIndex();
    const count = traversalPanel.getLeftSamples();
    const batchSize = 32;

    const requestId = ++currentFetchRequestId;

    // Do not clear all cells at once; update each cell in place as new data arrives

    try {
        let totalRecordsRetrieved = 0;

        for (let i = 0; i < count; i += batchSize) {
            if (requestId !== currentFetchRequestId) {
                console.debug(
                    `Discarding obsolete fetch request ${requestId}, ` +
                    `current is ${currentFetchRequestId}`);
                return;
            }

            const maxStartIndex = Math.max(0, traversalPanel.getMaxSampleId() - count + 1);
            if (start > maxStartIndex) {
                console.debug(`Start index ${start} exceeds max ${maxStartIndex}, aborting fetch`);
                return;
            }

            const currentBatchSize = Math.min(batchSize, count - i);

            // Get user-specified image resolution percentage (0 = auto based on grid size)
            const resolutionPercent = traversalPanel.getImageResolutionPercent();
            let resizeWidth = 0;
            let resizeHeight = 0;

            if (resolutionPercent > 0 && resolutionPercent <= 100) {
                // User specified a percentage - we'll send this as a special signal
                // The backend will need to calculate actual dimensions based on original image size
                // For now, we use a negative value to signal percentage mode
                resizeWidth = -resolutionPercent;
                resizeHeight = -resolutionPercent;
            } else {
                // Auto mode: use grid cell size
                const cellSize = gridManager.calculateGridDimensions().cellSize;
                resizeWidth = cellSize;
                resizeHeight = cellSize;
            }

            const request: DataSamplesRequest = {
                startIndex: start + i,
                recordsCnt: currentBatchSize,
                includeRawData: true,
                includeTransformedData: false,
                statsToRetrieve: [],
                resizeWidth: resizeWidth,
                resizeHeight: resizeHeight
            };

            const response = await fetchSamples(request);

            if (requestId !== currentFetchRequestId) {
                console.debug(`Discarding obsolete batch ${i}, current request is ${currentFetchRequestId}`);
                return;
            }

            if (response.success && response.dataRecords.length > 0) {
                console.log('First received data record:', response.dataRecords[0]);
                const preferences = displayOptionsPanel.getDisplayPreferences();
                preferences.splitColors = getSplitColors();
                response.dataRecords.forEach((record, index) => {
                    const cell = gridManager.getCellbyIndex(i + index);
                    if (cell) {
                        cell.populate(record, preferences);
                    } else {
                        console.warn(`Cell at index ${i + index} not found`);
                    }
                });
                totalRecordsRetrieved += response.dataRecords.length;

                if (response.dataRecords.length < currentBatchSize) {
                    break;
                }
            } else if (!response.success) {
                console.error("Failed to retrieve samples:", response.message);
                break;
            }
        }

        console.debug(`Retrieved ${totalRecordsRetrieved} records for grid of size ${count}.`);
    } catch (error) {
        // Error is already logged by fetchSamples, so we just catch to prevent unhandled promise rejection.
        console.debug("fetchAndDisplaySamples failed. See error above.");
    }
}

function debouncedFetchAndDisplay() {
    if (fetchTimeout) {
        clearTimeout(fetchTimeout);
    }
    fetchTimeout = setTimeout(() => {
        fetchAndDisplaySamples();
    }, 150);
}

async function updateLayout() {
    console.info('[updateLayout] Updating grid layout due to resize or cell size/zoom change.');
    if (!cellsContainer) {
        console.warn('[updateLayout] cellsContainer is missing.');
        return;
    }
    if (!gridManager) {
        console.warn('[updateLayout] gridManager is missing.');
        return;
    }

    // Preserve current selection by storing selected cell indices
    const selectedCells = selectionManager.getSelectedCells();
    const selectedIndices = new Set<number>();

    for (const selectedCell of selectedCells) {
        // Try to find the index of this cell in the current grid
        const cells = gridManager.getCells();
        const index = cells.indexOf(selectedCell);
        if (index !== -1) {
            selectedIndices.add(index);
        }
    }

    gridManager.updateGridLayout();
    const gridDims = gridManager.calculateGridDimensions();

    // Update SelectionManager with new cells array and register them
    const cells = gridManager.getCells();
    selectionManager.setAllCells(cells);
    for (const cell of cells) {
        selectionManager.registerCell(cell);
    }

    gridManager.clearAllCells();

    if (displayOptionsPanel) {
        const preferences = displayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();
        for (const cell of gridManager.getCells()) {
            cell.setDisplayPreferences(preferences);
        }
    }

    // Restore selection to cells at the preserved indices
    if (selectedIndices.size > 0) {
        selectionManager.clearSelection();
        const newCells = gridManager.getCells();
        for (const index of selectedIndices) {
            if (index >= 0 && index < newCells.length) {
                selectionManager.addCellToSelection(newCells[index]);
                // Update lastSelectedCell to the last one in the selection
                selectionManager.setLastSelectedCell(newCells[index]);
            }
        }
    }

    traversalPanel.updateSliderStep(gridDims.gridCount);
    traversalPanel.updateSliderTooltip();
    await fetchAndDisplaySamples();
}

// Debounce timer for updateDisplayOnly
let updateDisplayDebounceTimer: number | null = null;

async function updateDisplayOnly() {
    if (!cellsContainer || !displayOptionsPanel) {
        return;
    }

    const preferences = displayOptionsPanel.getDisplayPreferences();
    preferences.splitColors = getSplitColors();
    const gridDimensions = gridManager.calculateGridDimensions();

    for (let i = 0; i < gridDimensions.gridCount; i++) {
        const cell = gridManager.getCellbyIndex(i);
        if (cell) {
            cell.updateDisplay(preferences);
        }
    }
}

// Debounced version to prevent excessive re-renders during rapid changes
function updateDisplayOnlyDebounced() {
    if (updateDisplayDebounceTimer !== null) {
        clearTimeout(updateDisplayDebounceTimer);
    }
    updateDisplayDebounceTimer = window.setTimeout(() => {
        updateDisplayOnly();
        updateDisplayDebounceTimer = null;
    }, 50); // 50ms debounce
}

async function handleQuerySubmit(query: string): Promise<void> {
    try {
        const request: DataQueryRequest = { query, accumulate: false, isNaturalLanguage: true };
        const response: DataQueryResponse = await dataClient.applyDataQuery(request).response;
        updateUniqueTags(response.uniqueTags);
        const sampleCount = response.numberOfAllSamples;

        let currentStartIndex = traversalPanel.getStartIndex();
        const gridCount = gridManager.calculateGridDimensions().gridCount;

        if (sampleCount === 0) {
            currentStartIndex = 0;
        } else if (currentStartIndex >= sampleCount) {
            currentStartIndex = Math.max(0, sampleCount - gridCount);
        } else if (currentStartIndex + gridCount > sampleCount) {
            currentStartIndex = Math.max(0, sampleCount - gridCount);
        }

        // traversalPanel.setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);
        traversalPanel.updateSampleCounts(
            response.numberOfAllSamples,
            response.numberOfSamplesInTheLoop
        );
        traversalPanel.setStartIndex(currentStartIndex);

        fetchAndDisplaySamples();
    } catch (error) {
        console.error('Error applying query:', error);
    }
}

async function refreshDynamicStatsOnly() {
    if (!displayOptionsPanel) return;

    const displayPreferences = displayOptionsPanel.getDisplayPreferences();

    const start = traversalPanel.getStartIndex();
    const count = traversalPanel.getLeftSamples();
    const batchSize = 32;

    for (let i = 0; i < count; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, count - i);
        const request: DataSamplesRequest = {
            startIndex: start + i,
            recordsCnt: currentBatchSize,
            includeRawData: false,          // important: no images
            includeTransformedData: false,
            statsToRetrieve: [],            // dynamic stats only
            resizeWidth: 0,
            resizeHeight: 0
        };

        const response = await fetchSamples(request);

        if (response.success && response.dataRecords.length > 0) {
            response.dataRecords.forEach((record, index) => {
                const cell = gridManager.getCellbyIndex(i + index);
                if (cell && displayPreferences) {
                    // Update the cell's record data without repopulating the entire cell
                    // This preserves the current display state (overlay toggles, etc.)
                    const currentRecord = cell.getRecord();
                    if (currentRecord) {
                        // Merge new stats into existing record
                        record.dataStats.forEach(newStat => {
                            const existingStatIndex = currentRecord.dataStats.findIndex(
                                (s: any) => s.name === newStat.name
                            );
                            if (existingStatIndex >= 0) {
                                currentRecord.dataStats[existingStatIndex] = newStat;
                            } else {
                                currentRecord.dataStats.push(newStat);
                            }
                        });
                        // Update label to reflect new stats
                        cell.updateLabel();
                    }
                }
            });

            // Re-populate options to discover any newly added columns (like loss_class_N)
            displayOptionsPanel.populateOptions(response.dataRecords);
        } else if (!response.success) {
            console.error("Failed to retrieve samples:", response.message);
            break;
        }
    }
}


export async function initializeUIElements() {
    cellsContainer = document.getElementById('cells-grid') as HTMLElement;

    if (!cellsContainer) {
        console.error('cells-container not found');
        return;
    }

    // Cache reset button
    const cacheResetBtn = document.getElementById('cache-reset') as HTMLButtonElement | null;
    if (cacheResetBtn) {
        cacheResetBtn.addEventListener('click', () => {
            if (confirm('Reset all UI settings and cached data? This will reload the page.')) {
                localStorage.clear();
                sessionStorage.clear();
                location.reload();
            }
        });
    }

    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const chatSendBtn = document.getElementById('chat-send') as HTMLButtonElement;

    const submitQuery = async () => {
        if (chatInput && chatInput.value.trim() && chatSendBtn) {
            const query = chatInput.value.trim();

            // Set loading state
            chatSendBtn.disabled = true;
            chatSendBtn.classList.add('loading');
            chatSendBtn.textContent = 'Working...';
            chatInput.disabled = true;

            try {
                await handleQuerySubmit(query);
                chatInput.value = '';
            } finally {
                // Reset state
                chatSendBtn.disabled = false;
                chatSendBtn.classList.remove('loading');
                chatSendBtn.textContent = 'Send';
                chatInput.disabled = false;
                chatInput.focus();
            }
        }
    };

    if (chatInput) {
        chatInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await submitQuery();
            }
        });
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', async () => {
            await submitQuery();
        });
    }


    inspectorContainer = document.querySelector('.inspector-container') as HTMLElement | null;
    inspectorPanel = document.getElementById('options-panel') as HTMLElement | null;
    trainingStatePill = document.getElementById('training-state-pill') as HTMLElement | null;
    trainingSummary = document.getElementById('training-summary') as HTMLElement | null;
    detailsToggle = document.getElementById('details-toggle') as HTMLButtonElement | null;
    detailsBody = document.getElementById('details-body') as HTMLElement | null;

    const toggleBtn = document.getElementById('toggle-training') as HTMLButtonElement | null;
    if (toggleBtn) {
        const syncTrainingUI = () => {
            if (toggleBtn) {
                toggleBtn.textContent = isTraining ? 'Pause' : 'Resume';
                toggleBtn.classList.toggle('running', isTraining);
                toggleBtn.classList.toggle('paused', !isTraining);
            }
            if (trainingStatePill) {
                trainingStatePill.textContent = isTraining ? 'Running' : 'Paused';
                trainingStatePill.classList.toggle('pill-running', isTraining);
                trainingStatePill.classList.toggle('pill-paused', !isTraining);
            }
            if (trainingSummary) {
                const gridCount = gridManager ? gridManager.getCells().length : traversalPanel.getLeftSamples();
                const start = traversalPanel.getStartIndex();
                const end = Math.max(start, start + gridCount - 1);
                // trainingSummary.textContent = `TBD: add training stats`;
            }
        };

        let lastToggleError: string | null = null;

        toggleBtn.addEventListener('click', async () => {
            try {
                // Toggle desired state
                const nextState = !isTraining;

                // Optimistic UI update - update immediately for responsiveness
                isTraining = nextState;
                syncTrainingUI();

                // Disable button while request is in flight
                toggleBtn.disabled = true;

                const cmd: TrainerCommand = {
                    getHyperParameters: false,
                    getInteractiveLayers: false,
                    hyperParameterChange: {
                        hyperParameters: { isTraining: nextState } as HyperParameters,
                    } as HyperParameterCommand,
                };

                const resp = await dataClient.experimentCommand(cmd).response;

                // Re-enable button
                toggleBtn.disabled = false;

                if (resp.success) {
                    // Persist state to localStorage for reload fallback
                    localStorage.setItem('training-state', String(nextState));
                    lastToggleError = null; // Reset error tracking on success
                } else {
                    // Revert UI on failure
                    isTraining = !nextState;
                    syncTrainingUI();

                    console.error('Failed to toggle training state:', resp.message);
                    const errorMsg = `Failed to toggle training: ${resp.message}`;
                    if (lastToggleError === errorMsg) {
                        alert(errorMsg); // Show popup only on second consecutive same error
                    }
                    lastToggleError = errorMsg;
                }
            } catch (err) {
                // Re-enable button
                toggleBtn.disabled = false;

                // Revert UI on error
                isTraining = !isTraining;
                syncTrainingUI();

                console.error('Error toggling training state:', err);
                const errorMsg = 'Error toggling training state. See console for details.';
                if (lastToggleError === errorMsg) {
                    alert(errorMsg); // Show popup only on second consecutive same error
                }
                lastToggleError = errorMsg;
            }
        });

        // Helper function to fetch training state with retry logic
        // More patient settings for server startup
        async function fetchInitialTrainingState(retries = 5, initialDelay = 1000): Promise<boolean> {
            let delay = initialDelay;
            let maxAttempts = 15;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const initResp = await dataClient.experimentCommand({
                        getHyperParameters: true,
                        getInteractiveLayers: false,
                    }).response;

                    const hp = initResp.hyperParametersDescs || [];
                    const isTrainingDesc = hp.find(d => d.name === 'is_training' || d.label === 'is_training');

                    if (isTrainingDesc) {
                        let fetchedState = false;
                        // Bool may come as stringValue ('true'/'false') or numericalValue (1/0)
                        if (typeof isTrainingDesc.stringValue === 'string') {
                            fetchedState = isTrainingDesc.stringValue.toLowerCase() === 'true';
                        } else if (typeof isTrainingDesc.numericalValue === 'number') {
                            fetchedState = isTrainingDesc.numericalValue !== 0;
                        }

                        // Successfully fetched - save to localStorage for future fallback
                        localStorage.setItem('training-state', String(fetchedState));
                        console.log(`Training state fetched from server: ${fetchedState}`);
                        return fetchedState;
                    }

                    // No is_training parameter found, default to false
                    return false;

                } catch (e) {
                    if (attempt < maxAttempts - 1) {
                        // Show visual feedback that we're retrying (no enumerate)
                        if (trainingStatePill) {
                            trainingStatePill.textContent = `Connecting...`;
                            trainingStatePill.classList.add('pill-paused');
                        }
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    } else {
                        if (trainingStatePill) {
                            trainingStatePill.textContent = `Connection failed`;
                            trainingStatePill.classList.add('pill-paused');
                        }
                        console.warn(`Failed to fetch training state after ${maxAttempts} attempts`, e);

                        // Fall back to localStorage if available
                        const savedState = localStorage.getItem('training-state');
                        if (savedState !== null) {
                            const cachedState = savedState === 'true';
                            console.log(`Using cached training state from localStorage: ${cachedState}`);
                            return cachedState;
                        }

                        // Ultimate fallback: default to false (paused)
                        console.warn('No cached state available, defaulting to paused');
                        return false;
                    }
                }
            }

            return false;
        }

        // Initialize state from server with retry logic
        isTraining = await fetchInitialTrainingState();
        syncTrainingUI();
    }

    // Initialize display options panel
    const detailsOptionsRow = document.querySelector('.details-options-row') as HTMLElement;
    if (detailsOptionsRow) {
        displayOptionsPanel = new DataDisplayOptionsPanel(detailsOptionsRow);
        displayOptionsPanel.initialize();

        if (detailsToggle && inspectorPanel) {
            detailsToggle.addEventListener('click', () => {
                if (inspectorPanel) {
                    inspectorPanel.style.transform = 'translateX(-100%)';
                    inspectorPanel.classList.toggle('details-collapsed');
                }
            });

            // Close options panel when clicking outside
            document.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                // const isVisible = displayOptionsPanel.style.display !== 'none';

                // // Close if panel is visible and click is outside both panel and toggle button
                // if (isVisible && !displayOptionsPanel.contains(target) && !optionsToggle.contains(target)) {
                //     displayOptionsPanel.style.display = 'none';
                // }
            });
        }

        // Setup listeners for cell size and zoom - these need full layout update
        const cellSizeSlider = document.getElementById('cell-size') as HTMLInputElement;
        const zoomSlider = document.getElementById('zoom-level') as HTMLInputElement;

        // Restore saved settings
        const savedCellSize = localStorage.getItem('cellSize');
        const savedZoomLevel = localStorage.getItem('zoomLevel');

        if (cellSizeSlider) {
            if (savedCellSize) {
                cellSizeSlider.value = savedCellSize;
                const cellSizeValue = document.getElementById('cell-size-value');
                if (cellSizeValue) {
                    cellSizeValue.textContent = savedCellSize;
                }
            }

            cellSizeSlider.addEventListener('input', () => {
                const cellSizeValue = document.getElementById('cell-size-value');
                if (cellSizeValue) {
                    cellSizeValue.textContent = cellSizeSlider.value;
                }
                localStorage.setItem('cellSize', cellSizeSlider.value);
                updateLayout();
            });
        }

        if (zoomSlider) {
            if (savedZoomLevel) {
                zoomSlider.value = savedZoomLevel;
                const zoomValue = document.getElementById('zoom-value');
                if (zoomValue) {
                    zoomValue.textContent = `${savedZoomLevel}%`;
                }
            }

            zoomSlider.addEventListener('input', () => {
                const zoomValue = document.getElementById('zoom-value');
                if (zoomValue) {
                    zoomValue.textContent = `${zoomSlider.value}%`;
                }
                localStorage.setItem('zoomLevel', zoomSlider.value);
                updateLayout();
            });
        }

        // Listen for color changes and persist to localStorage
        const trainColorInput = document.getElementById('train-color') as HTMLInputElement;
        const evalColorInput = document.getElementById('eval-color') as HTMLInputElement;

        // This will be replaced by dynamic color pickers after fetching splits
        // Restore saved colors from localStorage
        const savedTrainColor = localStorage.getItem('train-color');
        const savedEvalColor = localStorage.getItem('eval-color');
        if (savedTrainColor && trainColorInput) {
            trainColorInput.value = savedTrainColor;
        }
        if (savedEvalColor && evalColorInput) {
            evalColorInput.value = savedEvalColor;
        }

        if (trainColorInput) {
            trainColorInput.addEventListener('input', () => {
                localStorage.setItem('train-color', trainColorInput.value);
                updateDisplayOnly();
            });
        }
        if (evalColorInput) {
            evalColorInput.addEventListener('input', () => {
                localStorage.setItem('eval-color', evalColorInput.value);
                updateDisplayOnly();
            });
        }

        // Checkbox changes only need display update, not layout recalculation
        displayOptionsPanel.onUpdate(updateDisplayOnly);
    }

    // Fetch available splits and create dynamic color pickers
    await fetchAndCreateSplitColorPickers();

    // Grid settings toggle functionality
    const gridSettingsToggle = document.getElementById('grid-settings-toggle') as HTMLButtonElement;
    const viewControls = document.getElementById('view-controls') as HTMLElement;

    if (gridSettingsToggle && viewControls) {
        let isSettingsExpanded = false; // Start collapsed
        viewControls.classList.add('collapsed'); // Start collapsed

        // Ensure settings are collapsed at start (no auto popup)
        // Only toggle on user click
        gridSettingsToggle.addEventListener('click', () => {
            isSettingsExpanded = !isSettingsExpanded;
            viewControls.classList.toggle('collapsed', !isSettingsExpanded);
        });
    }

    traversalPanel.initialize();
    gridManager = new GridManager(
        cellsContainer, traversalPanel,
        displayOptionsPanel as DataDisplayOptionsPanel);

    // Create selection manager and context menu
    selectionManager = new SelectionManager(cellsContainer);
    gridManager.setSelectionManager(selectionManager);

    // Register cells with selection manager and set all cells for range selection
    const allCells = gridManager.getCells();
    for (const cell of allCells) {
        selectionManager.registerCell(cell);
    }
    selectionManager.setAllCells(allCells);

    // Initialize context menu (cellsContainer is the grid element)
    contextMenuManager = new ContextMenu(cellsContainer, selectionManager, {
        onDiscard: async () => {
            const selectedCells = selectionManager.getSelectedCells();
            const sampleIds = selectedCells.map(cell => cell.getRecord()?.sampleId).filter((id): id is number => id !== undefined);
            const origins = selectedCells.map(cell => {
                const record = cell.getRecord();
                const originStat = record?.dataStats.find(s => s.name === 'origin');
                return originStat?.valueString || 'train';
            }).filter((origin): origin is string => origin !== undefined);

            if (sampleIds.length === 0) return;

            // Toggle discard: if any selected is already discarded, undiscard all; else discard all
            const anyDiscarded = selectedCells.some(cell => {
                const rec = cell.getRecord();
                if (!rec) return false;
                const stat = rec.dataStats?.find(s => s.name === 'deny_listed');
                return !!stat && Array.isArray(stat.value) && stat.value[0] === 1;
            });

            const request: DataEditsRequest = {
                statName: "deny_listed",
                floatValue: 0,
                stringValue: '',
                boolValue: anyDiscarded ? false : true,
                type: SampleEditType.EDIT_OVERRIDE,
                samplesIds: sampleIds,
                sampleOrigins: origins
            };

            try {
                const response = await dataClient.editDataSample(request).response;
                if (response.success) {
                    updateAffectedCellsOnly(sampleIds, request);
                } else {
                    console.error("Failed to update discard state:", response.message);
                }
            } catch (error) {
                console.error("Error toggling discard:", error);
            }
        },
        onAddTag: async (cells: GridCell[], tag: string) => {
            const sampleIds = cells.map(cell => cell.getRecord()?.sampleId).filter((id): id is number => id !== undefined);
            const origins = cells.map(cell => {
                const record = cell.getRecord();
                const originStat = record?.dataStats.find(s => s.name === 'origin');
                return originStat?.valueString || 'train';
            }).filter((origin): origin is string => origin !== undefined);

            if (sampleIds.length === 0) return;

            const request: DataEditsRequest = {
                statName: "tags",
                floatValue: 0,
                stringValue: tag,
                boolValue: false,
                type: SampleEditType.EDIT_OVERRIDE,
                samplesIds: sampleIds,
                sampleOrigins: origins
            };

            try {
                const response = await dataClient.editDataSample(request).response;
                if (response.success) {
                    updateAffectedCellsOnly(sampleIds, request);
                } else {
                    console.error("Failed to add tag:", response.message);
                }
            } catch (error) {
                console.error("Error adding tag:", error);
            }
        },
        onRemoveTag: async (cells: GridCell[]) => {
            const sampleIds = cells.map(cell => cell.getRecord()?.sampleId).filter((id): id is number => id !== undefined);
            const origins = cells.map(cell => {
                const record = cell.getRecord();
                const originStat = record?.dataStats.find(s => s.name === 'origin');
                return originStat?.valueString || 'train';
            }).filter((origin): origin is string => origin !== undefined);

            if (sampleIds.length === 0) return;

            const request: DataEditsRequest = {
                statName: "tags",
                floatValue: 0,
                stringValue: "", // clearing tag
                boolValue: false,
                type: SampleEditType.EDIT_OVERRIDE,
                samplesIds: sampleIds,
                sampleOrigins: origins
            };

            try {
                const response = await dataClient.editDataSample(request).response;
                if (response.success) {
                    updateAffectedCellsOnly(sampleIds, request);
                } else {
                    console.error("Failed to remove tag:", response.message);
                }
            } catch (error) {
                console.error("Error removing tag:", error);
            }
        }
    });

    traversalPanel.onUpdate(() => {
        debouncedFetchAndDisplay();
    });

    // Throttle resize events to avoid excessive re-layouts
    let resizeThrottleTimer: number | null = null;
    const throttledUpdateLayout = () => {
        if (resizeThrottleTimer === null) {
            resizeThrottleTimer = window.setTimeout(() => {
                updateLayout();
                resizeThrottleTimer = null;
            }, 100); // 100ms throttle for resize
        }
    };
    window.addEventListener('resize', throttledUpdateLayout);

    try {
        const request: DataQueryRequest = { query: "", accumulate: false, isNaturalLanguage: false };
        const response: DataQueryResponse = await dataClient.applyDataQuery(request).response;
        updateUniqueTags(response.uniqueTags);
        const sampleCount = response.numberOfAllSamples;
        // traversalPanel.setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);
        traversalPanel.updateSampleCounts(
            response.numberOfAllSamples,
            response.numberOfSamplesInTheLoop
        );

        // Fetch first sample to populate display options
        if (sampleCount > 0 && displayOptionsPanel) {
            const sampleRequest: DataSamplesRequest = {
                startIndex: 0,
                recordsCnt: 1,
                includeRawData: true,
                includeTransformedData: false,
                statsToRetrieve: [],
                resizeWidth: 0,
                resizeHeight: 0
            };
            const sampleResponse = await fetchSamples(sampleRequest);

            if (sampleResponse.success && sampleResponse.dataRecords.length > 0) {
                displayOptionsPanel.populateOptions(sampleResponse.dataRecords);
            }
        }
    } catch (error) {
        console.error('Error fetching sample count or stats:', error);
        // traversalPanel.setMaxSampleId(0);
        traversalPanel.updateSampleCounts(
            0, 0
        );
    }

    // Auto-refresh the grid every 2 seconds
    setInterval(() => {
        refreshDynamicStatsOnly();
    }, 10000);

    // Check agent health and update UI accordingly
    await checkAndUpdateAgentHealth();

    // Periodically check agent health (every 10 seconds)
    setInterval(async () => {
        await checkAndUpdateAgentHealth();
    }, 10000);

    setTimeout(updateLayout, 0);
}

async function checkAndUpdateAgentHealth() {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    if (!chatInput) return;

    try {
        // Use gRPC to check agent health
        const resp = await dataClient.checkAgentHealth({}).response;
        const available = resp.available ?? false;
        const message = resp.message || "";

        if (available) {
            chatInput.disabled = false;
            chatInput.placeholder = "drop 50% of the samples with losses between 1.4 and 1.9";
            chatInput.title = message;
        } else {
            chatInput.disabled = true;
            chatInput.placeholder = "Agent is not available";
            chatInput.title = message || "Agent is not available - please ensure the backend service is running";
        }
    } catch (error) {
        // Silently handle connection errors when backend is not available
        if (error?.code === 'UNAVAILABLE' || error?.message?.includes('503')) {
            // Expected error when backend is not running - don't log
        } else {
            console.warn("Error checking agent health:", error);
        }

        // On error, disable the input as a safety measure
        chatInput.disabled = true;
        chatInput.placeholder = "Agent is not available";
        chatInput.title = "Agent is not available - please ensure the backend service is running";
    }
}

// =============================================================================
// Old selection code removed - now using SelectionManager and ContextMenu classes
// =============================================================================

// =============================================================================
// Helper functions for selective cell updates

function getSelectedSampleIds(): number[] {
    return selectionManager.getSelectedCells()
        .map(cell => cell.getRecord()?.sampleId)
        .filter((id): id is number => id !== undefined);
}

function updateAffectedCellsOnly(sampleIds: number[], request: DataEditsRequest): void {
    // Update only the cells with changed samples instead of reloading entire grid
    if (sampleIds.length === 0) return;

    for (const cell of gridManager.getCells()) {
        const record = cell.getRecord();
        if (record && sampleIds.includes(record.sampleId)) {
            // Update the specific stat that was changed
            if (request.statName === 'tags') {
                // Update tags stat
                let stat = record.dataStats.find(s => s.name === 'tags');
                if (stat) {
                    stat.valueString = request.stringValue;
                } else {
                    // Create if doesn't exist
                    stat = {
                        name: 'tags',
                        type: 'string',
                        shape: [1],
                        valueString: request.stringValue,
                        value: []
                    };
                    record.dataStats.push(stat);
                }
                // If clearing, ensure valueString is empty
                if (!request.stringValue) {
                    stat.valueString = "";
                }
            } else if (request.statName === 'deny_listed') {
                // Update deny_listed stat
                const stat = record.dataStats.find(s => s.name === 'deny_listed');
                if (stat) {
                    stat.value = [request.boolValue ? 1 : 0];
                } else {
                    record.dataStats.push({
                        name: 'deny_listed',
                        type: 'scalar',
                        shape: [1],
                        value: [request.boolValue ? 1 : 0],
                        valueString: ''
                    });
                }
            }

            // Update cell display without refetching
            const prefs = displayOptionsPanel?.getDisplayPreferences();
            if (prefs) {
                cell.updateDisplay(prefs);
            }
        }
    }
}

// Handle context menu actions from modal popup
document.addEventListener('modalContextMenuAction', async (e: any) => {
    const { action, sampleId, origin } = e.detail;
    if (!sampleId) {
        console.error('No sampleId provided in modal action');
        return;
    }
});

// =============================================================================
// Image Detail Modal
// =============================================================================

const imageDetailModal = document.getElementById('image-detail-modal') as HTMLElement;
const modalImage = document.getElementById('modal-image') as HTMLImageElement;
const modalStatsContainer = document.getElementById('modal-stats-container') as HTMLElement;
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;

// Modal action bar (created on demand)
let modalActionBar: HTMLElement | null = null;
let currentModalRecord: any | null = null;

function ensureModalActionBar() {
    if (modalActionBar) return;
    if (!imageDetailModal) return;
    modalActionBar = document.createElement('div');
    modalActionBar.id = 'modal-action-bar';
    modalActionBar.style.position = 'absolute';
    modalActionBar.style.bottom = '12px';
    modalActionBar.style.right = '12px';
    modalActionBar.style.display = 'flex';
    modalActionBar.style.gap = '8px';
    modalActionBar.style.zIndex = '1200';
    modalActionBar.style.pointerEvents = 'auto';

    const makeButton = (label: string, action: string) => {
        const btn = document.createElement('button');
        btn.className = 'modal-action-btn';
        btn.textContent = label;
        btn.dataset.action = action;
        btn.style.padding = '6px 10px';
        btn.style.borderRadius = '6px';
        btn.style.border = 'none';
        btn.style.cursor = 'pointer';
        btn.style.background = '#222';
        btn.style.color = '#fff';
        btn.style.opacity = '0.9';
        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.9');
        return btn;
    };

    const tagBtn = makeButton('Tag', 'tag');
    const untagBtn = makeButton('Untag', 'untag');
    const discardBtn = makeButton('Discard', 'discard');

    modalActionBar.appendChild(tagBtn);
    modalActionBar.appendChild(untagBtn);
    modalActionBar.appendChild(discardBtn);

    imageDetailModal.appendChild(modalActionBar);

    // Button click handlers
    tagBtn.addEventListener('click', async () => {
        if (!currentModalRecord) return;
        const tag = prompt('Enter tag:');
        if (tag === null) return;
        const sample_ids = [currentModalRecord.sampleId];
        const origin = currentModalRecord.dataStats?.find((s: any) => s.name === 'origin')?.valueString || '';
        const req: DataEditsRequest = {
            statName: 'tags',
            floatValue: 0,
            stringValue: String(tag),
            boolValue: false,
            type: SampleEditType.EDIT_OVERRIDE,
            samplesIds: sample_ids,
            sampleOrigins: [origin]
        };
        try {
            const resp = await dataClient.editDataSample(req).response;
            if (!resp.success) alert(`Failed to add tag: ${resp.message}`);
        } catch (e) {
            console.error('Error tagging sample', e);
            alert('Error tagging sample');
        }
        debouncedFetchAndDisplay();
    });

    untagBtn.addEventListener('click', async () => {
        if (!currentModalRecord) return;
        const sample_ids = [currentModalRecord.sampleId];
        const origin = currentModalRecord.dataStats?.find((s: any) => s.name === 'origin')?.valueString || '';
        const req: DataEditsRequest = {
            statName: 'tags',
            floatValue: 0,
            stringValue: '',
            boolValue: false,
            type: SampleEditType.EDIT_OVERRIDE,
            samplesIds: sample_ids,
            sampleOrigins: [origin]
        };
        try {
            const resp = await dataClient.editDataSample(req).response;
            if (!resp.success) alert(`Failed to remove tag: ${resp.message}`);
        } catch (e) {
            console.error('Error untagging sample', e);
            alert('Error removing tag');
        }
        debouncedFetchAndDisplay();
    });

    discardBtn.addEventListener('click', async () => {
        if (!currentModalRecord) return;
        const sample_ids = [currentModalRecord.sampleId];
        const origin = currentModalRecord.dataStats?.find((s: any) => s.name === 'origin')?.valueString || '';
        const req: DataEditsRequest = {
            statName: 'deny_listed',
            floatValue: 0,
            stringValue: '',
            boolValue: true,
            type: SampleEditType.EDIT_OVERRIDE,
            samplesIds: sample_ids,
            sampleOrigins: [origin]
        };
        try {
            const resp = await dataClient.editDataSample(req).response;
            if (!resp.success) alert(`Failed to discard: ${resp.message}`);
            else {
                // Mark visually in modal if desired
            }
        } catch (e) {
            console.error('Error discarding sample', e);
            alert('Error discarding sample');
        }
        debouncedFetchAndDisplay();
    });

    // Size buttons proportionally to image width
    const adjustButtonSizes = () => {
        if (!modalActionBar) return;
        const imgW = modalImage?.clientWidth || 200;
        const btnWidth = Math.max(56, Math.min(160, Math.round(imgW * 0.14)));
        const buttons = modalActionBar.querySelectorAll('button');
        buttons.forEach((b: Element) => {
            const btn = b as HTMLElement;
            btn.style.width = `${btnWidth}px`;
            btn.style.fontSize = `${Math.max(12, Math.round(btnWidth * 0.12))}px`;
        });
    };

    modalImage.addEventListener('load', adjustButtonSizes);
    window.addEventListener('resize', adjustButtonSizes);
}
// Helper function to apply segmentation overlays to modal image
function applySegmentationToModal(
    baseImageUrl: string,
    gtStat: any | null,
    predStat: any | null,
    showRaw: boolean,
    showGt: boolean,
    showPred: boolean,
    showDiff: boolean,
    classPreferences: any
) {
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
        const finalUrl = SegmentationRenderer.getInstance().render(
            img,
            gtStat ? { value: gtStat.value, shape: gtStat.shape } : null,
            predStat ? { value: predStat.value, shape: predStat.shape } : null,
            {
                showRaw,
                showGt,
                showPred,
                showDiff,
                alpha: 0.45,
                classPrefs: classPreferences
            }
        );

        modalImage.src = finalUrl;

        console.log('[Modal] Applied segmentation overlays at', width, 'x', height);
    };

    img.src = baseImageUrl;
}

async function openImageDetailModal(cell: HTMLElement) {
    const gridCell = getGridCell(cell);
    if (!gridCell) return;

    const record = gridCell.getRecord();
    if (!record) return;

    // Remember the record for modal actions and ensure action bar exists
    currentModalRecord = record;
    ensureModalActionBar();

    // Show the modal immediately with the grid's current image
    const imgElement = gridCell.getImage();
    if (imgElement && imgElement.src) {
        modalImage.src = imgElement.src;
    }

    // Populate metadata stats
    modalStatsContainer.innerHTML = '';

    // Add sample ID first
    const sampleIdItem = document.createElement('div');
    sampleIdItem.className = 'modal-stat-item';
    sampleIdItem.innerHTML = `
        <div class="modal-stat-label">Sample ID</div>
        <div class="modal-stat-value">${record.sampleId}</div>
    `;
    modalStatsContainer.appendChild(sampleIdItem);

    // Add all data stats (sorted for better readability)
    if (record.dataStats && record.dataStats.length > 0) {
        // Sort stats for better organization
        const sortedStats = [...record.dataStats].sort((a, b) => {
            // Define sort order categories
            const getCategory = (statName: string): number => {
                // 1. General info (top)
                if (statName === 'origin') return 1;
                if (statName === 'task_type') return 2;
                if (statName === 'tags') return 3;

                // 2. Class distribution stats
                if (statName === 'num_classes_present') return 10;
                if (statName === 'dominant_class') return 11;
                if (statName === 'dominant_class_ratio') return 12;
                if (statName === 'background_ratio') return 13;

                // 3. Other stats (alphabetically)
                // Skip loss-related stats here
                if (!statName.includes('loss')) {
                    return 100;
                }

                // 4. Aggregate loss stats (bottom, for closer inspection)
                if (statName === 'mean_loss') return 1000;
                if (statName === 'median_loss') return 1001;
                if (statName === 'min_loss') return 1002;
                if (statName === 'max_loss') return 1003;
                if (statName === 'std_loss') return 1004;

                // 5. Per-class losses (loss_class_0, loss_class_1, etc.) - very bottom
                if (statName.startsWith('loss_class_')) {
                    const classNum = parseInt(statName.replace('loss_class_', ''));
                    return 2000 + classNum; // Sort numerically
                }

                // 6. Any other loss-related stats
                if (statName.includes('loss')) {
                    return 1500;
                }

                return 100;
            };

            const catA = getCategory(a.name);
            const catB = getCategory(b.name);

            if (catA !== catB) {
                return catA - catB;
            }

            // Within same category, sort alphabetically
            return a.name.localeCompare(b.name);
        });

        sortedStats.forEach((stat: any) => {
            // Skip raw_data and other binary/large data
            if (stat.name === 'raw_data' || stat.name === 'transformed_data' ||
                stat.name === 'label' || stat.name === 'pred_mask') {
                return;
            }

            const statItem = document.createElement('div');
            statItem.className = 'modal-stat-item';

            let value = '';


            // Helper to format numbers in scientific notation if very small or large
            function formatSmartNumber(num: number): string {
                if (num === 0) return '0';
                const absNum = Math.abs(num);
                if ((absNum > 0 && absNum < 1e-3) || absNum >= 1e5) {
                    // Use scientific notation, e.g. 7.10e-6
                    const exp = num.toExponential(2);
                    // Optionally format as 7.10×10⁻⁶
                    const [mantissa, exponent] = exp.split('e');
                    const expNum = parseInt(exponent, 10);
                    return `${mantissa}×10<sup>${expNum}</sup>`;
                }
                return num % 1 !== 0 ? num.toFixed(4) : String(num);
            }

            if (stat.valueString !== undefined && stat.valueString !== '') {
                value = stat.valueString;
            }
            // Handle scalar values (in value array)
            else if (stat.value && stat.value.length > 0) {
                if (stat.value.length === 1) {
                    // Single scalar value
                    const num = stat.value[0];
                    if (typeof num === 'number' && stat.name && stat.name.includes('loss')) {
                        value = formatSmartNumber(num);
                    } else {
                        value = typeof num === 'number' && num % 1 !== 0
                            ? num.toFixed(4)
                            : String(num);
                    }
                } else {
                    // Array of values - show first few
                    value = stat.value.slice(0, 3).map((v: number) =>
                        (typeof v === 'number' && stat.name && stat.name.includes('loss'))
                            ? formatSmartNumber(v)
                            : (typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : String(v))
                    ).join(', ');
                    if (stat.value.length > 3) {
                        value += '...';
                    }
                }
            } else {
                value = '-';
            }

            statItem.innerHTML = `
                <div class="modal-stat-label">${stat.name || 'Unknown'}</div>
                <div class="modal-stat-value">${value}</div>
            `;
            modalStatsContainer.appendChild(statItem);
        });
    }

    // Show the modal
    imageDetailModal.classList.add('visible');
    document.body.style.overflow = 'hidden';

    // Trigger size adjustment for modal action buttons
    try {
        modalImage.dispatchEvent(new Event('load'));
    } catch (e) {
        // ignore
    }

    // Now fetch full resolution image in background
    try {
        // Find the cell's position in the grid
        const cells = gridManager.getCells();
        const cellIndex = cells.indexOf(gridCell);

        if (cellIndex === -1) {
            console.warn('[Modal] Could not find cell in grid');
            return;
        }

        // Calculate the actual index in the current dataset view
        const startIndex = traversalPanel.getStartIndex();
        const actualIndex = startIndex + cellIndex;

        console.log('[Modal] Fetching full resolution:');
        console.log('  - Cell index in grid:', cellIndex);
        console.log('  - Current start index:', startIndex);
        console.log('  - Actual fetch index:', actualIndex);
        console.log('  - Sample ID:', record.sampleId);

        // Add loading indicator
        modalImage.classList.add('loading');

        // Request FULL resolution image
        const highResRequest: DataSamplesRequest = {
            startIndex: actualIndex,
            recordsCnt: 1,
            includeRawData: true,
            includeTransformedData: false,
            statsToRetrieve: [],
            resizeWidth: -100,  // -100 = 100% of original
            resizeHeight: -100
        };

        const highResResponse = await fetchSamples(highResRequest);

        if (highResResponse.success && highResResponse.dataRecords.length > 0) {
            const highResRecord = highResResponse.dataRecords[0];

            // Find raw_data stat
            const rawDataStat = highResRecord.dataStats.find(
                (stat: any) => stat.name === 'raw_data' && stat.type === 'bytes'
            );

            if (rawDataStat && rawDataStat.value && rawDataStat.value.length > 0) {
                // Convert bytes to base64 in chunks to avoid stack overflow
                const bytes = new Uint8Array(rawDataStat.value);
                let binary = '';
                const chunkSize = 8192;

                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, Array.from(chunk));
                }

                const base64Image = btoa(binary);

                // Check if this is a segmentation task and apply overlays
                const taskTypeStat = highResRecord.dataStats.find(
                    (stat: any) => stat.name === 'task_type'
                );
                const isSegmentation = taskTypeStat?.valueString === 'segmentation';

                if (isSegmentation && displayOptionsPanel) {
                    // Get GT and Pred masks from the response
                    const gtStat = highResRecord.dataStats.find(
                        (stat: any) => stat.name === 'label' && stat.type === 'array'
                    );
                    const predStat = highResRecord.dataStats.find(
                        (stat: any) => stat.name === 'pred_mask' && stat.type === 'array'
                    );

                    // Get current display preferences
                    const prefs = displayOptionsPanel.getDisplayPreferences();
                    const showRaw = prefs['showRawImage'] ?? true;
                    const showGt = prefs['showGtMask'] ?? true;
                    const showPred = prefs['showPredMask'] ?? true;
                    const showDiff = prefs['showDiffMask'] ?? false;

                    // Apply segmentation visualization
                    const baseImageUrl = `data:image/png;base64,${base64Image}`;
                    applySegmentationToModal(
                        baseImageUrl,
                        gtStat,
                        predStat,
                        showRaw,
                        showGt,
                        showPred,
                        showDiff,
                        prefs.classPreferences
                    );
                } else {
                    // Non-segmentation: just show the image
                    modalImage.src = `data:image/png;base64,${base64Image}`;
                }

                console.log('[Modal] Updated to full resolution');
            } else {
                console.warn('[Modal] No raw_data found in response');
            }
        } else {
            console.warn('[Modal] Failed to fetch full resolution:', highResResponse.message);
        }

        modalImage.classList.remove('loading');
    } catch (error) {
        console.error('[Modal] Error fetching full resolution:', error);
        modalImage.classList.remove('loading');
    }
}

function closeImageDetailModal() {
    imageDetailModal.classList.remove('visible');
    document.body.style.overflow = ''; // Restore scrolling
    currentModalRecord = null;
}

// Close button
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeImageDetailModal);
}

// Close on backdrop click
if (imageDetailModal) {
    imageDetailModal.addEventListener('click', (e) => {
        if (e.target === imageDetailModal || (e.target as HTMLElement).classList.contains('modal-backdrop')) {
            closeImageDetailModal();
        }
    });
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageDetailModal.classList.contains('visible')) {
        closeImageDetailModal();
    }
});

// // Add double-click event listener to grid cells
// grid.addEventListener('dblclick', (e) => {
//     const target = e.target as HTMLElement;
//     const cell = target.closest('.cell') as HTMLElement | null;

//     if (cell) {
//         openImageDetailModal(cell);
//     }
// });

// =============================================================================



let autoRefreshTimer: NodeJS.Timeout | null = null;
let autoRefreshEnabled = false;

function setupAutoRefresh() {
    const checkbox = document.getElementById('auto-refresh-checkbox') as HTMLInputElement;
    if (!checkbox) return;

    // Enable auto-refresh by default
    autoRefreshEnabled = true;
    checkbox.checked = true;
    startAutoRefresh();

    checkbox.addEventListener('change', () => {
        autoRefreshEnabled = checkbox.checked;
        if (autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
}

async function startAutoRefresh() {
    stopAutoRefresh();
    const interval = 15; // seconds
    // On each interval, refresh the sample count, slider, grid size, and agent status
    autoRefreshTimer = setInterval(async () => {
        await Promise.all([
            refreshGridAndCounts(),
            freezeInputIfAgentUnavailable()
        ]);
    }, interval * 1000);
}

// This function mimics a full manual refresh (F5) for grid, slider, and sample counts
async function refreshGridAndCounts() {
    try {
        // 1. Update loader splits (availableSplits) and color pickers if new splits are detected
        await fetchAndCreateSplitColorPickers();

        // 2. Query for the latest sample count and update slider/grid
        const request: DataQueryRequest = { query: '', accumulate: false, isNaturalLanguage: true };
        const response: DataQueryResponse = await dataClient.applyDataQuery(request).response;
        const sampleCount = response.numberOfAllSamples;
        let currentStartIndex = traversalPanel.getStartIndex();
        const gridCount = gridManager.calculateGridDimensions().gridCount;
        if (sampleCount === 0) {
            currentStartIndex = 0;
        } else if (currentStartIndex >= sampleCount) {
            currentStartIndex = Math.max(0, sampleCount - gridCount);
        } else if (currentStartIndex + gridCount > sampleCount) {
            currentStartIndex = Math.max(0, sampleCount - gridCount);
        }
        traversalPanel.updateSampleCounts(
            response.numberOfAllSamples,
            response.numberOfSamplesInTheLoop
        );
        traversalPanel.setStartIndex(currentStartIndex);

        // 3. Update grid samples
        await fetchAndDisplaySamples();
    } catch (error) {
        console.error('[AutoRefresh] Failed to refresh grid, counts, or splits:', error);
    }
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeDarkMode();
        initializeUIElements();
        setupAutoRefresh();
    });
} else {
    initializeDarkMode();
    initializeUIElements();
    setupAutoRefresh();
}

function updateUniqueTags(tags: string[]) {
    uniqueTags = tags || [];
    const datalist = document.getElementById('existing-tags');
    if (datalist) {
        datalist.innerHTML = uniqueTags.map(t => `<option value="${t}">`).join('');
    }
}

function openTaggingModal(sampleIds: number[], origins: string[]) {
    const modal = document.getElementById('tagging-modal');
    const input = document.getElementById('tag-input') as HTMLInputElement;
    const container = document.getElementById('quick-tags-container');
    const selectionContainer = document.getElementById('selection-tags-container');
    const selectionSection = document.getElementById('selection-tags-section');
    const submitBtn = document.getElementById('tag-submit-btn');
    const cancelBtn = document.getElementById('tag-cancel-btn');
    const closeBtn = document.getElementById('tagging-close-btn');
    const clearBtn = document.getElementById('tag-clear-btn');

    if (!modal || !input || !container) return;

    input.value = '';

    // Calculate current tags union
    const currentTagsSet = new Set<string>();
    selectedCells.forEach(cell => {
        const gridCell = getGridCell(cell);
        const record = gridCell?.getRecord();
        const tagsStat = record?.dataStats.find((s: any) => s.name === 'tags');
        const tagsStr = tagsStat?.valueString || "";
        tagsStr.split(',').map((t: string) => t.trim()).filter((t: string) => t).forEach((t: string) => currentTagsSet.add(t));
    });

    // Fill current tags
    if (selectionContainer && selectionSection) {
        if (currentTagsSet.size > 0) {
            selectionSection.style.display = 'block';
            selectionContainer.innerHTML = '';
            Array.from(currentTagsSet).sort().forEach(tag => {
                const btn = document.createElement('button');
                btn.className = 'quick-tag-btn current-tag-chip';
                btn.innerHTML = `${tag} <span class="remove-x">×</span>`;
                btn.title = `Remove tag "${tag}"`;
                btn.onclick = () => handleRemove(tag);
                selectionContainer.appendChild(btn);
            });
        } else {
            selectionSection.style.display = 'none';
        }
    }

    // Fill all tags (historical)
    container.innerHTML = '';
    uniqueTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'quick-tag-btn';
        btn.textContent = tag;
        btn.onclick = () => {
            input.value = tag;
            handleSubmit();
        };
        container.appendChild(btn);
    });

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('visible');
        input.focus();
    }, 10);

    const cleanup = () => {
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        submitBtn?.removeEventListener('click', handleSubmit);
        cancelBtn?.removeEventListener('click', cleanup);
        closeBtn?.removeEventListener('click', cleanup);
        clearBtn?.removeEventListener('click', handleClear);
        input.onkeydown = null;
    };

    const handleRemove = async (tag: string) => {
        const request: DataEditsRequest = {
            statName: "tags",
            floatValue: 0,
            stringValue: tag,
            boolValue: false,
            type: SampleEditType.EDIT_REMOVE,
            samplesIds: sampleIds,
            sampleOrigins: origins
        };

        try {
            const response = await dataClient.editDataSample(request).response;
            if (response.success) {
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        const existingTagsStat = record?.dataStats.find((s: any) => s.name === 'tags');
                        const currentTagsStr = existingTagsStat?.valueString || "";
                        const newTagsStr = currentTagsStr.split(',').map((t: string) => t.trim()).filter((t: string) => t && t !== tag).join(', ');
                        gridCell.updateStats({ "tags": newTagsStr });
                    }
                });
                cleanup(); // Close modal on success
            } else {
                alert(`Failed to remove tag: ${response.message}`);
            }
        } catch (error) {
            alert(`Error removing tag: ${error}`);
        }
    };

    const handleSubmit = async () => {
        const tag = input.value.trim();
        if (!tag) {
            cleanup();
            return;
        }

        const request: DataEditsRequest = {
            statName: "tags",
            floatValue: 0,
            stringValue: tag,
            boolValue: false,
            type: SampleEditType.EDIT_ACCUMULATE,
            samplesIds: sampleIds,
            sampleOrigins: origins
        };

        try {
            const response = await dataClient.editDataSample(request).response;
            if (response.success) {
                if (!uniqueTags.includes(tag)) {
                    updateUniqueTags([...uniqueTags, tag].sort());
                }
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        const existingTagsStat = record?.dataStats.find((s: any) => s.name === 'tags');
                        const currentTagsStr = existingTagsStat?.valueString || "";
                        const currentTags = currentTagsStr.split(',').map((t: string) => t.trim()).filter((t: string) => t);
                        if (!currentTags.includes(tag)) {
                            currentTags.push(tag);
                        }
                        const newTagsStr = currentTags.join(', ');
                        gridCell.updateStats({ "tags": newTagsStr });
                    }
                });
            } else {
                alert(`Failed to add tag: ${response.message}`);
            }
        } catch (error) {
            alert(`Error adding tag: ${error}`);
        }
        cleanup();
    };

    const handleClear = async () => {
        if (confirm("Are you sure you want to remove all tags from the selected images?")) {
            await removeTag(sampleIds, origins);
            cleanup();
        }
    };

    submitBtn?.addEventListener('click', handleSubmit);
    cancelBtn?.addEventListener('click', cleanup);
    closeBtn?.addEventListener('click', cleanup);
    clearBtn?.addEventListener('click', handleClear);

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
    };
}

async function removeTag(sampleIds: number[], origins: string[]) {
    const request: DataEditsRequest = {
        statName: "tags",
        floatValue: 0,
        stringValue: "",
        boolValue: false,
        type: SampleEditType.EDIT_OVERRIDE,
        samplesIds: sampleIds,
        sampleOrigins: origins
    };

    try {
        const response = await dataClient.editDataSample(request).response;
        if (response.success) {
            selectedCells.forEach(cell => {
                const gridCell = getGridCell(cell);
                if (gridCell) {
                    gridCell.updateStats({ "tags": "" });
                }
            });
        } else {
            alert(`Failed to remove tag: ${response.message}`);
        }
    } catch (error) {
        alert(`Error removing tag: ${error}`);
    }
}
