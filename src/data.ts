
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { DataServiceClient } from "./data_service.client";
import { QueryRequest, QueryResponse, SamplesRequest, SamplesResponse} from "./data_service";
import { DataDisplayOptionsPanel } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { GridManager } from "./GridManager";

const SERVER_URL = "http://localhost:8080";

const transport = new GrpcWebFetchTransport(
    {baseUrl: SERVER_URL, format: "text",});

const dataClient = new DataServiceClient(transport);
const traversalPanel = new DataTraversalAndInteractionsPanel();

let cellsContainer: HTMLElement | null;
let displayOptionsPanel: DataDisplayOptionsPanel | null = null;
let gridManager: GridManager;

let fetchTimeout: NodeJS.Timeout | null = null;
let currentFetchRequestId = 0;


function getSplitColors(): SplitColors {
    const trainColor = (document.getElementById('train-color') as HTMLInputElement)?.value;
    const evalColor = (document.getElementById('eval-color') as HTMLInputElement)?.value;

    console.log ()
    return { train: trainColor, eval: evalColor };
}

async function fetchSamples(request: SamplesRequest): Promise<SamplesResponse> {
    try {
        const response = await dataClient.getSamples(request).response;
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
            const request: SamplesRequest = {
                startIndex: start + i,
                recordsCnt: currentBatchSize,
                includeRawData: true,
                includeTransformedData: false,
                statsToRetrieve: []
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
        const request: QueryRequest = { query, accumulate: false, isNaturalLanguage: true };
        const response: QueryResponse = await dataClient.applyQuery(request).response;
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

        traversalPanel.setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);
        traversalPanel.setStartIndex(currentStartIndex);

        fetchAndDisplaySamples();
    } catch (error) {
        console.error('Error applying query:', error);
    }
}

export async function initializeUIElements() {
    cellsContainer = document.getElementById('cells-grid') as HTMLElement;
    
    if (!cellsContainer) {
        console.error('cells-container not found');
        return;
    }

    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    if (chatInput) {
        chatInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && chatInput.value.trim()) {
                event.preventDefault();
                await handleQuerySubmit(chatInput.value.trim());
                chatInput.value = '';
            }
        });
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

    traversalPanel.onUpdate(() => {
        debouncedFetchAndDisplay();
    });
    
    window.addEventListener('resize', updateLayout);

    try {
        const request: QueryRequest = { query: "", accumulate: false, isNaturalLanguage: false };
        const response: QueryResponse = await dataClient.applyQuery(request).response;        
        const sampleCount = response.numberOfAllSamples;
        traversalPanel.setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);

        // Fetch first sample to populate display options
        if (sampleCount > 0 && displayOptionsPanel) {
            const sampleRequest: SamplesRequest = {
                startIndex: 0,
                recordsCnt: 1,
                includeRawData: true,
                includeTransformedData: false,
                statsToRetrieve: []
            };
            const sampleResponse = await fetchSamples(sampleRequest);

            if (sampleResponse.success && sampleResponse.dataRecords.length > 0) {
                displayOptionsPanel.populateOptions(sampleResponse.dataRecords);
            }
        }
    } catch (error) {
        console.error('Error fetching sample count or stats:', error);
        traversalPanel.setMaxSampleId(0);
    }

    setTimeout(updateLayout, 0);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUIElements);
} else {
    initializeUIElements();
}
