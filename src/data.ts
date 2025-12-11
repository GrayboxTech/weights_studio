
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
} from "./experiment_service";
import { DataDisplayOptionsPanel, SplitColors } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { GridManager } from "./GridManager";
import { initializeDarkMode } from "./darkMode";


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

let fetchTimeout: NodeJS.Timeout | null = null;
let currentFetchRequestId = 0;

function getSplitColors(): SplitColors {
    const trainColor = (document.getElementById('train-color') as HTMLInputElement)?.value;
    const evalColor = (document.getElementById('eval-color') as HTMLInputElement)?.value;

    console.log()
    return { train: trainColor, eval: evalColor };
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

    gridManager.clearAllCells();

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

async function handleQuerySubmit(query: string): Promise<void> {
    try {
        const request: DataQueryRequest = { query, accumulate: false, isNaturalLanguage: true };
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

    const start = traversalPanel.getStartIndex();
    const count = traversalPanel.getLeftSamples();
    const batchSize = 32;

    const preferences = displayOptionsPanel.getDisplayPreferences();
    preferences.splitColors = getSplitColors();

    // Here we DO NOT clear cells, we only update them
    for (let i = 0; i < count; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, count - i);
        const request: DataSamplesRequest = {
            startIndex: start + i,
            recordsCnt: currentBatchSize,
            includeRawData: false,          // <<-- important
            includeTransformedData: false,
            // Ask only for dynamic stats, if you want to be explicit
            // statsToRetrieve: ["sample_last_loss", "sample_encounters", "deny_listed", "tags"]
            statsToRetrieve: [],
            resizeWidth: 0,
            resizeHeight: 0
        };

        const response = await fetchSamples(request);

        if (response.success && response.dataRecords.length > 0) {
            response.dataRecords.forEach((record, index) => {
                const cell = gridManager.getCellbyIndex(i + index);
                if (cell) {
                    // You might want a method like `updateFromRecord` if `populate` resets everything
                    cell.populate(record, preferences);
                    // or a more selective `cell.updateStats(record)`
                }
            });
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


    const toggleBtn = document.getElementById('toggle-training') as HTMLButtonElement | null;
    if (toggleBtn) {
        const updateToggleLabel = () => {
            toggleBtn.textContent = isTraining ? 'Pause' : 'Resume';
            toggleBtn.classList.toggle('running', isTraining);
            toggleBtn.classList.toggle('paused', !isTraining);
        };

        let lastToggleError: string | null = null;

        toggleBtn.addEventListener('click', async () => {
            try {
                // Toggle desired state
                const nextState = !isTraining;

                const cmd: TrainerCommand = {
                    getHyperParameters: false,
                    getInteractiveLayers: false,
                    hyperParameterChange: {
                        hyperParameters: { isTraining: nextState } as HyperParameters,
                    } as HyperParameterCommand,
                };

                const resp = await dataClient.experimentCommand(cmd).response;
                if (resp.success) {
                    isTraining = nextState;
                    updateToggleLabel();
                    lastToggleError = null; // Reset error tracking on success
                } else {
                    console.error('Failed to toggle training state:', resp.message);
                    const errorMsg = `Failed to toggle training: ${resp.message}`;
                    if (lastToggleError === errorMsg) {
                        alert(errorMsg); // Show popup only on second consecutive same error
                    }
                    lastToggleError = errorMsg;
                }
            } catch (err) {
                console.error('Error toggling training state:', err);
                const errorMsg = 'Error toggling training state. See console for details.';
                if (lastToggleError === errorMsg) {
                    alert(errorMsg); // Show popup only on second consecutive same error
                }
                lastToggleError = errorMsg;
            }
        });

        // Initialize state from server hyper parameters
        try {
            const initResp = await dataClient.experimentCommand({
                getHyperParameters: true,
                getInteractiveLayers: false,
            }).response;
            const hp = initResp.hyperParametersDescs || [];
            const isTrainingDesc = hp.find(d => d.name === 'is_training' || d.label === 'is_training');
            if (isTrainingDesc) {
                // Bool may come as stringValue ('true'/'false') or numericalValue (1/0)
                if (typeof isTrainingDesc.stringValue === 'string') {
                    isTraining = isTrainingDesc.stringValue.toLowerCase() === 'true';
                } else if (typeof isTrainingDesc.numericalValue === 'number') {
                    isTraining = isTrainingDesc.numericalValue !== 0;
                }
            }
        } catch (e) {
            console.warn('Could not fetch initial training state; defaulting to paused.', e);
            isTraining = false;
        } finally {
            updateToggleLabel();
        }
    }

    // Initialize display options panel
    const detailsOptionsRow = document.querySelector('.details-options-row') as HTMLElement;
    if (detailsOptionsRow) {
        displayOptionsPanel = new DataDisplayOptionsPanel(detailsOptionsRow);
        displayOptionsPanel.initialize();

        const optionsToggle = document.getElementById('options-toggle');
        const optionsPanel = document.getElementById('options-panel');

        if (optionsToggle && optionsPanel) {
            optionsToggle.addEventListener('click', () => {
                const isVisible = optionsPanel.style.display !== 'none';
                optionsPanel.style.display = isVisible ? 'none' : 'block';
                optionsToggle.classList.toggle('collapsed', isVisible);
                optionsToggle.classList.toggle('expanded', !isVisible);
            });
        }

        // Setup listeners for cell size and zoom - these need full layout update
        const cellSizeSlider = document.getElementById('cell-size') as HTMLInputElement;
        const zoomSlider = document.getElementById('zoom-level') as HTMLInputElement;

        if (cellSizeSlider) {
            cellSizeSlider.addEventListener('input', () => {
                const cellSizeValue = document.getElementById('cell-size-value');
                if (cellSizeValue) {
                    cellSizeValue.textContent = cellSizeSlider.value;
                }
                updateLayout();
            });
        }

        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                const zoomValue = document.getElementById('zoom-value');
                if (zoomValue) {
                    zoomValue.textContent = `${zoomSlider.value}%`;
                }
                updateLayout();
            });
        }

        // Listen for color changes
        const trainColorInput = document.getElementById('train-color');
        const evalColorInput = document.getElementById('eval-color');
        if (trainColorInput) {
            trainColorInput.addEventListener('input', updateDisplayOnly);
        }
        if (evalColorInput) {
            evalColorInput.addEventListener('input', updateDisplayOnly);
        }

        // Checkbox changes only need display update, not layout recalculation
        displayOptionsPanel.onUpdate(updateDisplayOnly);
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
            const origins = selectedCells.map(cell => cell.getRecord()?.origin || 'train').filter((origin): origin is string => origin !== undefined);

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
            const origins = cells.map(cell => cell.getRecord()?.origin || 'train').filter((origin): origin is string => origin !== undefined);
            
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
        }
    });

    traversalPanel.onUpdate(() => {
        debouncedFetchAndDisplay();
    });

    window.addEventListener('resize', updateLayout);

    try {
        const request: DataQueryRequest = { query: "", accumulate: false, isNaturalLanguage: false };
        const response: DataQueryResponse = await dataClient.applyDataQuery(request).response;
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
        // Lightweight direct check to Ollama (fallback without gRPC types)
        const resp = await fetch('http://localhost:11435/api/tags', { method: 'GET' });
        const available = resp.ok;

        if (available) {
            chatInput.disabled = false;
            chatInput.placeholder = "drop 50% of the samples with losses between 1.4 and 1.9";
            chatInput.title = "";
        } else {
            chatInput.disabled = true;
            chatInput.placeholder = "Agent is not available";
            chatInput.title = "Agent is not available - please ensure Ollama is running";
        }
    } catch (error) {
        console.error("Error checking agent health:", error);
        // On error, disable the input as a safety measure
        chatInput.disabled = true;
        chatInput.placeholder = "Agent is not available";
        chatInput.title = "Agent is not available - please ensure Ollama is running";
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
                const stat = record.dataStats.find(s => s.name === 'tags');
                if (stat) {
                    stat.valueString = request.stringValue;
                } else {
                    // Create if doesn't exist
                    record.dataStats.push({
                        name: 'tags',
                        type: 'string',
                        shape: [1],
                        valueString: request.stringValue,
                        value: []
                    });
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
    
    const sample_ids = [sampleId];
    const origins = origin ? [origin] : [];
    
    console.log('Modal action:', action, 'sampleId:', sampleId, 'origin:', origin);
    
    switch (action) {
        case 'discard':
            const discardRequest: DataEditsRequest = {
                statName: "deny_listed",
                floatValue: 0,
                stringValue: '',
                boolValue: true,
                type: SampleEditType.EDIT_OVERRIDE,
                samplesIds: sample_ids,
                sampleOrigins: origins
            }
            console.log("Sending discard request from modal:", discardRequest);
            try {
                const response = await dataClient.editDataSample(discardRequest).response;
                console.log("Discard response from modal:", response);
                if (!response.success) {
                    alert(`Failed to discard: ${response.message}`);
                } else {
                    updateAffectedCellsOnly(sample_ids, discardRequest);
                }
            } catch (error) {
                console.error("Error discarding from modal:", error);
                alert(`Error discarding: ${error}`);
            }
            break;
    }
});

// =============================================================================




if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeDarkMode();
        initializeUIElements();
    });
} else {
    initializeDarkMode();
    initializeUIElements();
}
