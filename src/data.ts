
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
let isTraining = false; // local UI state, initialized from server on load (default to paused)
let inspectorOpen = true;
let inspectorContainer: HTMLElement | null = null;
let inspectorPanel: HTMLElement | null = null;
let trainingStatePill: HTMLElement | null = null;
let trainingSummary: HTMLElement | null = null;
let detailsToggle: HTMLButtonElement | null = null;
let detailsBody: HTMLElement | null = null;

let fetchTimeout: NodeJS.Timeout | null = null;
let currentFetchRequestId = 0;


function getSplitColors(): SplitColors {
    const trainColor = (document.getElementById('train-color') as HTMLInputElement)?.value || '#4CAF50';
    const evalColor = (document.getElementById('eval-color') as HTMLInputElement)?.value || '#2196F3';
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
    if (!gridManager) {
        console.warn('[updateLayout] gridManager is missing.');
        return;
    }

    gridManager.updateGridLayout();
    const gridDims = gridManager.calculateGridDimensions();
    console.log(`[updateLayout] Grid dimensions: ${JSON.stringify(gridDims)}`);

    gridManager.clearAllCells();
    const cellsAfterClear = gridManager.getCells().length;
    console.log(`[updateLayout] Cells after clear: ${cellsAfterClear}`);

    if (displayOptionsPanel) {
        const preferences = displayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();
        for (const cell of gridManager.getCells()) {
            cell.setDisplayPreferences(preferences);
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
                    cell.populate(record, displayPreferences);
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
                trainingSummary.textContent = `TBD: add training stats`;
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
            syncTrainingUI();
        }
    }

    // Initialize display options panel
    const detailsOptionsRow = document.querySelector('.details-options-row') as HTMLElement;
    if (detailsOptionsRow) {
        displayOptionsPanel = new DataDisplayOptionsPanel(detailsOptionsRow);
        displayOptionsPanel.initialize();

        if (detailsToggle && inspectorPanel) {
            detailsToggle.addEventListener('click', () => {
                inspectorPanel.classList.toggle('details-collapsed');
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

        // Listen for color changes and persist to localStorage
        const trainColorInput = document.getElementById('train-color') as HTMLInputElement;
        const evalColorInput = document.getElementById('eval-color') as HTMLInputElement;

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

    traversalPanel.initialize();
    gridManager = new GridManager(
        cellsContainer, traversalPanel,
        displayOptionsPanel as DataDisplayOptionsPanel);

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

    setTimeout(updateLayout, 0);
}

// =============================================================================

const grid = document.getElementById('cells-grid') as HTMLElement;
const contextMenu = document.getElementById('context-menu') as HTMLElement;

let selectedCells: Set<HTMLElement> = new Set();

// Helper function to get GridCell from DOM element
function getGridCell(element: HTMLElement): GridCell | null {
    return (element as any).__gridCell || null;
}

// For drag selection
let isDragging = false;
let startX = 0;
let startY = 0;
let lastMouseUpX = 0;
let lastMouseUpY = 0;
let selectionBox: HTMLElement | null = null;

function createSelectionBox() {
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.style.position = 'absolute';
        selectionBox.style.border = '1px dashed #adcef3ff';
        selectionBox.style.backgroundColor = 'rgba(3, 97, 198, 0.2)';
        selectionBox.style.pointerEvents = 'none';
        selectionBox.style.zIndex = '1000';
        document.body.appendChild(selectionBox);
    }
}

grid.addEventListener('mousedown', (e) => {
    // Hide context menu on any new selection action
    hideContextMenu();

    // Prevent default browser drag behavior and text selection
    e.preventDefault();

    const target = e.target as HTMLElement;
    const cell = target.closest('.cell') as HTMLElement | null;

    // On a mousedown without Ctrl, if the click is not on an already selected cell,
    // clear the existing selection. This prepares for a new selection (either click or drag).
    if (!e.ctrlKey && !e.metaKey) {
        if (!cell || !selectedCells.has(cell)) {
            clearSelection();
        }
    }

    // Start dragging to select
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    createSelectionBox();
    selectionBox!.style.left = `${startX}px`;
    selectionBox!.style.top = `${startY}px`;
    selectionBox!.style.width = '0px';
    selectionBox!.style.height = '0px';
    selectionBox!.style.display = 'block';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !selectionBox) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;

    const selectionRect = selectionBox.getBoundingClientRect();

    for (const cell of grid.children) {
        const cellElem = cell as HTMLElement;
        const cellRect = cellElem.getBoundingClientRect();

        const isIntersecting =
            selectionRect.left < cellRect.right &&
            selectionRect.right > cellRect.left &&
            selectionRect.top < cellRect.bottom &&
            selectionRect.bottom > cellRect.top;

        if (isIntersecting) {
            addCellToSelection(cellElem);
        } else if (!e.ctrlKey && !e.metaKey) {
            // If not holding Ctrl, deselect cells that are no longer in the rectangle.
            removeCellFromSelection(cellElem);
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    // Store the mouse up position for context menu
    lastMouseUpX = e.clientX;
    lastMouseUpY = e.clientY;

    if (selectionBox) {
        selectionBox.style.display = 'none';

        // Distinguish a click from a drag by checking how much the mouse moved.
        const movedDuringDrag = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;
        const target = e.target as HTMLElement;
        const cell = target.closest('.cell') as HTMLElement | null;

        if (!movedDuringDrag && cell) { // This was a click, not a drag.
            if (e.ctrlKey || e.metaKey) {
                // With Ctrl, toggle the clicked cell.
                toggleCellSelection(cell);
            } else {
                // Without Ctrl, it's a simple click.
                // If the cell wasn't already part of a multi-selection, clear others and select just this one.
                if (!selectedCells.has(cell) || selectedCells.size <= 1) {
                    clearSelection();
                    addCellToSelection(cell);
                }
                // If it was part of a selection, the mousedown already handled it, so do nothing on mouseup.
            }
        }
        // If it was a drag (movedDuringDrag is true), we do nothing on mouseup.
        // The selection was already handled by the 'mousemove' event.
    }
});


function toggleCellSelection(cell: HTMLElement) {
    if (selectedCells.has(cell)) {
        removeCellFromSelection(cell);
    } else {
        addCellToSelection(cell);
    }
}

function addCellToSelection(cell: HTMLElement) {
    if (!selectedCells.has(cell)) {
        selectedCells.add(cell);
        cell.classList.add('selected');
    }
}

function removeCellFromSelection(cell: HTMLElement) {
    if (selectedCells.has(cell)) {
        selectedCells.delete(cell);
        cell.classList.remove('selected');
    }
}

function clearSelection() {
    selectedCells.forEach(cell => {
        cell.classList.remove('selected');
    });
    selectedCells.clear();
}

grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const cell = target.closest('.cell') as HTMLElement | null;

    // Use the event's coordinates for the position
    const menuX = e.pageX;
    const menuY = e.pageY;

    if (cell) {
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+right-click: toggle the cell in selection and show menu
            toggleCellSelection(cell);
            if (selectedCells.size > 0) {
                showContextMenu(menuX, menuY);
            } else {
                hideContextMenu();
            }
        } else if (selectedCells.has(cell)) {
            // Right-click on already selected cell: keep selection, show menu
            showContextMenu(menuX, menuY);
        } else {
            // Right-click on unselected cell: clear others, select this one, show menu
            clearSelection();
            addCellToSelection(cell);
            showContextMenu(menuX, menuY);
        }
    } else {
        // Right-click on empty space: clear selection and hide menu
        clearSelection();
        hideContextMenu();
    }
});

function showContextMenu(x: number, y: number) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('visible');
}

function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

document.addEventListener('click', (e) => {
    // A drag is completed on mouseup, but a click event still fires.
    // We check if the mouse moved significantly to distinguish a real click from the end of a drag.
    const movedDuringDrag = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;

    const target = e.target as HTMLElement;
    if (!target.closest('.context-menu') && !target.closest('.cell') && !isDragging && !movedDuringDrag) {
        hideContextMenu();
        clearSelection();
    }
});

contextMenu.addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (action) {
        console.log(
            `Action: ${action}, selected cells:`,
            Array.from(selectedCells)
                .map(c => getGridCell(c)?.getRecord()?.sampleId)
                .filter(id => id !== undefined)
        );

        const sample_ids = Array.from(selectedCells)
            .map(c => getGridCell(c)?.getRecord()?.sampleId)
            .filter(id => id !== undefined)

        let origins = []
        for (const c of Array.from(selectedCells)) {
            const gridCell = getGridCell(c);
            const record = gridCell?.getRecord();
            // console.log("record: ", record)
            const originStat = record?.dataStats.find(stat => stat.name === 'origin');
            if (originStat) {
                origins.push(originStat.valueString as string);
            }
        }

        switch (action) {
            case 'add-tag':
                const tag = prompt('Enter tag:');
                console.log('Tag to add:', tag);

                const request: DataEditsRequest = {
                    statName: "tags",
                    floatValue: 0,
                    stringValue: String(tag),
                    boolValue: false,
                    type: SampleEditType.EDIT_OVERRIDE,
                    samplesIds: sample_ids,
                    sampleOrigins: origins
                }
                console.log("Sending tag request: ", request)
                try {
                    const response = await dataClient.editDataSample(request).response;
                    console.log("Tag response:", response);
                    if (!response.success) {
                        console.error("Failed to add tag:", response.message);
                        alert(`Failed to add tag: ${response.message}`);
                    }
                } catch (error) {
                    console.error("Error adding tag:", error);
                    alert(`Error adding tag: ${error}`);
                }
                break;
            case 'discard':
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        cell.classList.add('discarded');
                    }
                });

                const drequest: DataEditsRequest = {
                    statName: "deny_listed",
                    floatValue: 0,
                    stringValue: '',
                    boolValue: true,
                    type: SampleEditType.EDIT_OVERRIDE,
                    samplesIds: sample_ids,
                    sampleOrigins: origins
                }
                console.log("Sending discard request: ", drequest)
                try {
                    const dresponse = await dataClient.editDataSample(drequest).response;
                    console.log("Discard response:", dresponse);
                    if (!dresponse.success) {
                        console.error("Failed to discard:", dresponse.message);
                    }
                } catch (error) {
                    console.error("Error discarding:", error);
                }
                break;
        }

        hideContextMenu();
        clearSelection();

        // Refresh the display to show updated tags/discarded status
        debouncedFetchAndDisplay();
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
