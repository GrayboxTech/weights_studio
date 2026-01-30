import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { ExperimentServiceClient } from "./proto/experiment_service.client";
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
    AgentIntentType,
} from "./proto/experiment_service";
import { DataDisplayOptionsPanel, SplitColors } from "./grid_data/DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./grid_data/DataTraversalAndInteractionsPanel";
import { GridManager } from "./grid_data/GridManager";
import { initializeDarkMode } from "./darkMode";
import Chart from "chart.js/auto";

// Import new modular managers
import * as plotsManager from "./plots/plotsManager";
import { SignalBranch } from "./plots/plotsManager";
import * as gridDataManager from "./grid_data/gridDataManager";
import * as leftPanel from "./left_panel/leftPanel";

// Import helper utilities
import {
    bytesToBase64,
    DOUBLE_CLICK_THRESHOLD_MS,
    SIGNAL_HISTORY_LIMIT,
    MINUS_ICON,
    PLUS_ICON,
    locallyDiscardedSampleIds,
    locallyRestoredSampleIds,
    addChatMessage,
    getGridCell,
    createSelectionBox,
    toggleCellSelection,
    addCellToSelection,
    removeCellFromSelection,
    clearSelection,
    showContextMenu,
    hideContextMenu,
    applySegmentationToModal,
    closeImageDetailModal,
    ensureTagMetadataEnabled,
    getRecordOrigin,
    setActiveBrush,
    updateUniqueTags,
    addLocallyDiscardedSample,
    addLocallyRestoredSample,
    isLocallyDiscarded,
    isLocallyRestored,
} from "./helpers";


const SERVER_URL = "http://localhost:8080";

// Initialize grid configuration from environment variables
(window as any).MAX_GRID_SIZE = (window as any).MAX_GRID_SIZE || 256;
console.log(`[Config] Max grid size: ${(window as any).MAX_GRID_SIZE} samples`);

const transport = new GrpcWebFetchTransport(
    { baseUrl: SERVER_URL, format: "text", });

const dataClient = new ExperimentServiceClient(transport);

// Expose dataClient to window for plotsManager to use
(window as any).dataClient = dataClient;
const traversalPanel = new DataTraversalAndInteractionsPanel();

// Grid settings persistence helpers - now in gridDataManager
// (Code removed and moved to gridDataManager module)

let cellsContainer: HTMLElement | null;
let displayOptionsPanel: DataDisplayOptionsPanel | null = null;
let gridManager: GridManager;
let isTraining = false; // local UI state, initialized from server on load (default to paused)
let inspectorContainer: HTMLElement | null = null;
let inspectorPanel: HTMLElement | null = null;
let trainingStatePill: HTMLElement | null = null;
let connectionStatusElement: HTMLElement | null = null;
let trainingSummary: HTMLElement | null = null;
let detailsToggle: HTMLButtonElement | null = null;
let detailsBody: HTMLElement | null = null;
let uniqueTags: string[] = [];

// Module-level variables for data fetching and UI state
let fetchSamples: ((request: DataSamplesRequest) => Promise<DataSamplesResponse>) | null = null;


// Grid selection state variables
let selectedCells: Set<HTMLElement> = new Set();
// Expose selection set so helpers can keep it in sync
(window as any).selectedCells = selectedCells;
// Parallel tracking of selected sample data (id and origin)
let selectedSampleData: Map<HTMLElement, { id: number; origin: string }> = new Map();
let isDragging = false;
let startX = 0;
let startY = 0;
let lastMouseUpX = 0;
let lastMouseUpY = 0;
let selectionBox: HTMLElement | null = null;

// Expose leftPanel module to window for helpers and other modules
(window as any).leftPanelModule = leftPanel;

// Wrapper around clearSelection to also clear our tracking data structures
function clearSelectionState(): void {
    clearSelection();
    selectedCells.clear();
    selectedSampleData.clear();
}

// Helper function to create module-level selection box
function ensureSelectionBox(): HTMLElement {
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        // Apply styling inline
        selectionBox.style.position = 'fixed';
        selectionBox.style.border = '1px dashed #0a7aff';
        selectionBox.style.backgroundColor = 'rgba(10, 122, 255, 0.15)';
        selectionBox.style.pointerEvents = 'none';
        selectionBox.style.zIndex = '1000';
        document.body.appendChild(selectionBox);
    }
    return selectionBox;
}

// Signal charts managed by plotsManager module
// const signalCharts is accessed via plotsManager.getSignalChart()

// Track if we just restored a checkpoint (to create new branch instead of appending)
let justRestoredCheckpoint = false;
let nextBranchId = 0;

// Track if this is the first poll (full history) or incremental
let isFirstPoll = true;

// DOUBLE_CLICK_THRESHOLD_MS is imported from helpers module

let datasetInfoReady = false;

// Painter Mode State now managed by leftPanel module
// let isPainterMode, isPainterRemoveMode, activeBrushTags accessed via leftPanel exports

let currentAbortController: AbortController | null = null;

// Training metrics for display: map of metricName -> { value, timestamp }
const latestMetrics = new Map<string, { value: number; timestamp: number }>();



// Grid settings wrapper functions
function saveGridSettings(): void {
    gridDataManager.saveGridSettings();
}
function restoreGridSettings(): void {
    gridDataManager.restoreGridSettings();
}

// Plot refresh state wrapper functions
function getPlotRefreshEnabled(): boolean {
    return plotsManager.getPlotRefreshEnabled();
}
function setPlotRefreshEnabled(enabled: boolean): void {
    plotsManager.setPlotRefreshEnabled(enabled);
}
function getPlotRefreshIntervalMs(): number {
    return plotsManager.getPlotRefreshIntervalMs();
}
function setPlotRefreshIntervalMs(ms: number): void {
    plotsManager.setPlotRefreshIntervalMs(ms);
}

// Branch color persistence - now in gridDataManager module
// Use: gridDataManager.saveBranchColor(), gridDataManager.loadBranchColor()
// Constants SIGNAL_HISTORY_LIMIT, MINUS_ICON, PLUS_ICON now in helpers module
// Variables locallyDiscardedSampleIds, locallyRestoredSampleIds now in helpers module

// Cache managed by gridDataManager module
// Use gridDataManager functions: getCachedResponse(), setCachedResponse()
// Constants MAX_PREFETCH_BATCHES, MAX_CACHE_ENTRIES now in gridDataManager
// Track discarded sample IDs locally to persist state across refreshes
// These are now defined in helpers module and imported above


// --- Chat History and UI Helpers ---
// All helper functions are now in helpers module:
// addChatMessage, getGridCell, createSelectionBox, toggleCellSelection, etc.

// --- Grid Data ---
// All grid data functions moved to gridDataManager
// Use: gridDataManager.fetchAndDisplaySamples(), gridDataManager.updateLayout(), gridDataManager.updateDisplayOnly()
// Use: gridDataManager.prefetchBidirectionalBatches(), gridDataManager.prefetchMultipleBatches()
// Use: gridDataManager.getSplitColors(), gridDataManager.getAvailableSplits()


// Weights Studio Environment Variable Controls
/**
 * Ensure training is paused before executing data-modifying actions.
 * If training is currently running, pause it and wait for confirmation.
 */
async function ensureTrainingPaused(): Promise<void> {
    if (!isTraining) {
        return; // Already paused, proceed
    }

    console.log('🛑 Pausing training before executing action...');

    try {
        const cmd: TrainerCommand = {
            getHyperParameters: false,
            getInteractiveLayers: false,
            hyperParameterChange: {
                hyperParameters: { isTraining: false } as HyperParameters,
            } as HyperParameterCommand,
        };

        const resp = await dataClient.experimentCommand(cmd).response;
        if (resp.success) {
            isTraining = false;
            localStorage.setItem('training-state', 'false');
            console.log('✓ Training paused for action');

            // Update UI
            const toggleBtn = document.getElementById('toggle-training') as HTMLButtonElement | null;
            if (toggleBtn) {
                toggleBtn.textContent = 'Resume';
                toggleBtn.classList.toggle('running', false);
                toggleBtn.classList.toggle('paused', true);
            }
            if (trainingStatePill) {
                trainingStatePill.classList.toggle('pill-running', false);
                trainingStatePill.classList.toggle('pill-paused', true);
            }
        } else {
            console.warn('Failed to pause training:', resp.message);
        }
    } catch (err) {
        console.error('Error pausing training:', err);
    }
}

export async function handleQuerySubmit(query: string, isNaturalLanguage: boolean = true): Promise<void> {
    try {
        // Ensure training is paused before sending agent request
        await ensureTrainingPaused();

        const request: DataQueryRequest = { query, accumulate: false, isNaturalLanguage };
        const response: DataQueryResponse = await dataClient.applyDataQuery(request, { abort: currentAbortController?.signal }).response;

        // Handle Analysis Intent (Chat Mode)
        if (response.agentIntentType === AgentIntentType.INTENT_ANALYSIS) {
            addChatMessage(response.analysisResult || "Analysis complete.", 'agent');
            return; // Do not refresh grid for analysis queries
        }

        // If there is a meaningful message, log it to chat
        if (response.message && response.message !== "Reset view to base dataset") {
            addChatMessage(response.message, 'agent');
        } else if (response.message === "Reset view to base dataset") {
            addChatMessage("Reset view to full dataset.", 'agent');
        }

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

        traversalPanel.updateSampleCounts(
            response.numberOfAllSamples,
            response.numberOfSamplesInTheLoop
        );
        traversalPanel.setStartIndex(currentStartIndex);

        // Handle Filter Intent (Grid Mode)
        // Clear cache since query changed the dataset
        gridDataManager.clearResponseCache();

        gridDataManager.fetchAndDisplaySamples();
    } catch (error) {
        console.error('Error applying query:', error);
        throw error;
    }
}

async function refreshDynamicStatsOnly() {
    if (!displayOptionsPanel) return;

    const refreshBtn = document.getElementById('refresh-stats');
    if (refreshBtn) refreshBtn.classList.add('refreshing');

    // Ensure icon spins at least once (0.5s) even if fetch is instant
    const minSpinDuration = new Promise(resolve => setTimeout(resolve, 500));

    console.debug('[Refresh Stats] Updating dynamic stats for visible samples...');

    const displayPreferences = displayOptionsPanel.getDisplayPreferences();

    const start = traversalPanel.getStartIndex();
    const count = traversalPanel.getLeftSamples();
    const batchSize = Math.min(gridManager.calculateGridDimensions().gridCount, 128);

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

        // Use internal fetch from gridDataManager which was registered during initialization
        const response = await gridDataManager.externalFetchSamples!(request);

        if (response.success && response.dataRecords.length > 0) {
            response.dataRecords.forEach((record, index) => {
                const cell = gridManager.getCellbyIndex(i + index);
                if (cell && displayPreferences) {
                    // Update the cell's record data without repopulating the entire cell
                    // This preserves the current display state (overlay toggles, etc.)
                    const currentRecord = cell.getRecord();
                    if (currentRecord) {
                        // Merge new stats into existing record
                        record.dataStats.forEach((newStat: any) => {
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

    // Wait for the minimum spin time if it hasn't elapsed yet
    await minSpinDuration;

    if (refreshBtn) refreshBtn.classList.remove('refreshing');
}

// Main function that will initialize the UI Elements
export async function initializeUIElements() {
    cellsContainer = document.getElementById('cells-grid') as HTMLElement;
    plotsManager.initSignalsBoard();
    // Register gridDataManager with plotsManager for cross-module access
    plotsManager.registerGridDataManager(gridDataManager);

    if (!cellsContainer) {
        console.error('cells-container not found');
        return;
    }

    // Initialize left panel (painter mode, tags, etc.)
    leftPanel.initializeLeftPanel();

    // Drag selection is handled by grid event listeners below, not by createSelectionBox()
    // createSelectionBox() from helpers interferes with cell-based dragging

    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const chatSendBtn = document.getElementById('chat-send') as HTMLButtonElement;

    const submitQuery = async () => {
        if (chatInput && chatInput.value.trim() && chatSendBtn) {
            const query = chatInput.value.trim();

            // Set loading state (keep enabled for cancellation)
            // chatSendBtn.disabled = true;
            chatSendBtn.classList.add('loading');
            chatSendBtn.title = "Click to abort";
            chatInput.disabled = true;

            // Create AbortController
            currentAbortController = new AbortController();

            // 1. Add User Message immediately
            addChatMessage(query, 'user');
            chatInput.value = '';

            // 2. Add Typing indicator
            const typingMsg = addChatMessage('', 'agent', true);

            try {
                await handleQuerySubmit(query, true);
            } catch (error: any) {
                if (error.name === 'AbortError' || error.message.includes('aborted')) {
                    addChatMessage("Process Aborted.", 'agent');
                } else {
                    console.error("Query failed:", error);
                    // 3. Add Error Message to history
                    addChatMessage(`Error: ${error.message || "Unknown error"}`, 'agent');
                }
            } finally {
                // Remove typing indicator if it exists
                if (typingMsg) typingMsg.remove();
                // Reset state
                currentAbortController = null;
                chatSendBtn.disabled = false;
                chatSendBtn.classList.remove('loading');
                chatSendBtn.title = "Send query";
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

        // Auto-show history on focus if not empty
        chatInput.addEventListener('focus', () => {
            const list = document.getElementById('chat-history-list');
            const panel = document.getElementById('chat-history-panel');
            if (list && list.children.length > 0 && panel) {
                panel.style.display = 'flex';
            }
        });
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', async () => {
            if (chatSendBtn.classList.contains('loading')) {
                if (currentAbortController) {
                    currentAbortController.abort();
                }
            } else {
                await submitQuery();
            }
        });
    }

    // Clear History Button
    const clearBtn = document.getElementById('chat-history-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const list = document.getElementById('chat-history-list');
            const panel = document.getElementById('chat-history-panel');
            if (list) list.innerHTML = '';
            if (panel) panel.style.display = 'none';
        });
    }

    // Open History Panel on chat input focus
    const chatInputForHistory = document.getElementById('chat-input');
    if (chatInputForHistory) {
        chatInputForHistory.addEventListener('focus', () => {
            const panel = document.getElementById('chat-history-panel');
            if (!panel) return;
            panel.style.display = 'flex';
        });
    }

    // Keyboard shortcut: Ctrl+H to toggle history
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            const panel = document.getElementById('chat-history-panel');
            if (panel) {
                const isVisible = panel.style.display === 'flex';
                panel.style.display = isVisible ? 'none' : 'flex';
            }
        }

        // Escape to close
        if (e.key === 'Escape') {
            const panel = document.getElementById('chat-history-panel');
            if (panel && panel.style.display === 'flex') {
                panel.style.display = 'none';
            }
        }
    });

    // Global click handler: close popups/panels when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Close chat history panel when clicking outside
        const chatPanel = document.getElementById('chat-history-panel');
        const inputContainer = document.querySelector('.chat-input-container');
        if (chatPanel && chatPanel.style.display === 'flex' && inputContainer) {
            // If click is NOT inside panel AND NOT inside input container, close it
            if (!chatPanel.contains(target) && !inputContainer.contains(target)) {
                chatPanel.style.display = 'none';
            }
        }

        // Close grid settings panel when clicking outside
        const gridSettingsToggle = document.getElementById('grid-settings-toggle');
        const gridSettingsOverlay = document.getElementById('grid-settings-overlay');
        if (gridSettingsOverlay && !gridSettingsOverlay.classList.contains('collapsed')) {
            // If click is NOT inside overlay AND NOT the toggle button itself, collapse it
            if (!gridSettingsOverlay.contains(target) && target !== gridSettingsToggle && !gridSettingsToggle?.contains(target)) {
                gridSettingsOverlay.classList.add('collapsed');
                gridSettingsToggle?.classList.remove('active');
            }
        }


    });

    // Custom Resize Handles for Chat History Panel
    const panel = document.getElementById('chat-history-panel');
    const resizeLeft = document.querySelector('.resize-left') as HTMLElement;
    const resizeBottom = document.querySelector('.resize-bottom') as HTMLElement;
    const resizeBottomLeft = document.querySelector('.resize-bottom-left') as HTMLElement;

    if (panel && resizeLeft) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let startRight = 0;

        resizeLeft.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            startRight = window.innerWidth - panel.getBoundingClientRect().right;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dx = startX - e.clientX;
            const newWidth = startWidth + dx;
            if (newWidth >= 300 && newWidth <= window.innerWidth * 0.5) {
                panel.style.width = newWidth + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }

    if (panel && resizeBottom) {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeBottom.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = panel.offsetHeight;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dy = e.clientY - startY;
            const newHeight = startHeight + dy;
            const minHeight = 200;
            const maxHeight = window.innerHeight - 160;
            if (newHeight >= minHeight && newHeight <= maxHeight) {
                panel.style.height = newHeight + 'px';
                panel.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }

    if (panel && resizeBottomLeft) {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        resizeBottomLeft.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dx = startX - e.clientX;
            const dy = e.clientY - startY;
            const newWidth = startWidth + dx;
            const newHeight = startHeight + dy;

            if (newWidth >= 300 && newWidth <= window.innerWidth * 0.5) {
                panel.style.width = newWidth + 'px';
            }
            const minHeight = 200;
            const maxHeight = window.innerHeight - 160;
            if (newHeight >= minHeight && newHeight <= maxHeight) {
                panel.style.height = newHeight + 'px';
                panel.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }

    // Inspector Panel Resize Handle
    const inspectorResizeHandle = document.getElementById('inspector-resize-handle');
    const inspectorContainerEl = document.querySelector('.inspector-container') as HTMLElement;

    if (inspectorResizeHandle && inspectorContainerEl) {
        let isResizingInspector = false;
        let startXInspector = 0;
        let startWidthInspector = 0;

        // Restore saved width from localStorage
        const savedWidth = localStorage.getItem('inspector-width');
        if (savedWidth) {
            const width = parseInt(savedWidth, 10);
            if (width >= 180 && width <= 450) {
                inspectorContainerEl.style.width = width + 'px';
            }
        }

        inspectorResizeHandle.addEventListener('mousedown', (e) => {
            isResizingInspector = true;
            startXInspector = e.clientX;
            startWidthInspector = inspectorContainerEl.offsetWidth;
            inspectorResizeHandle.classList.add('dragging');
            document.body.classList.add('resizing-inspector');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingInspector) return;

            const dx = e.clientX - startXInspector;
            const newWidth = startWidthInspector + dx;

            // Clamp to min/max
            const clampedWidth = Math.max(180, Math.min(450, newWidth));
            inspectorContainerEl.style.width = clampedWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizingInspector) {
                isResizingInspector = false;
                inspectorResizeHandle.classList.remove('dragging');
                document.body.classList.remove('resizing-inspector');

                // Save to localStorage
                localStorage.setItem('inspector-width', inspectorContainerEl.offsetWidth.toString());

                // Trigger layout update
                gridDataManager.updateLayout();
            }
        });
    }




    inspectorContainer = document.querySelector('.inspector-container') as HTMLElement | null;
    inspectorPanel = document.getElementById('options-panel') as HTMLElement | null;
    trainingStatePill = document.getElementById('training-state-pill') as HTMLElement | null;
    connectionStatusElement = document.getElementById('connection-status') as HTMLElement | null;
    trainingSummary = document.getElementById('training-summary') as HTMLElement | null;
    detailsToggle = document.getElementById('details-toggle') as HTMLButtonElement | null;
    detailsBody = document.getElementById('details-body') as HTMLElement | null;

    const toggleBtn = document.getElementById('toggle-training') as HTMLButtonElement | null;
    if (toggleBtn) {
        const syncTrainingUI = async () => {
            if (toggleBtn) {
                toggleBtn.textContent = isTraining ? 'Pause' : 'Resume';
                toggleBtn.classList.toggle('running', isTraining);
                toggleBtn.classList.toggle('paused', !isTraining);
            }
            if (trainingStatePill) {
                trainingStatePill.classList.toggle('pill-running', isTraining);
                trainingStatePill.classList.toggle('pill-paused', !isTraining);
            }
            if (connectionStatusElement && isTraining !== undefined) {
                connectionStatusElement.textContent = ''; // Clear connecting text once we have a state
            }

            // Fetch training_steps_to_do from hyperparameters
            try {
                const cmd = {
                    getHyperParameters: true,
                    getInteractiveLayers: false,
                };
                const resp = await dataClient.experimentCommand(cmd).response;
                const params = resp.hyperParametersDescs || [];

                // Prioritize 'total_training_steps' for the progress bar denominator.
                // Fall back to 'training_left'/'training_steps_to_do' only if total is missing.
                const stepsParam = params.find((p: any) => p.name === 'total_training_steps') ||
                    params.find((p: any) =>
                        p.name === 'training_left' ||
                        p.name === 'training_steps_to_do' ||
                        p.label === 'Left Training Steps' ||
                        p.label === 'training_steps_to_do'
                    );

                if (stepsParam && stepsParam.numericalValue) {
                    const newTotal = stepsParam.numericalValue;

                    // Update if changed or not set
                    if (((window as any).trainingTotalSteps) !== newTotal) {
                        console.log(`📊 Training total steps updated: ${(window as any).trainingTotalSteps} -> ${newTotal}`);
                        (window as any).trainingTotalSteps = newTotal;

                        const totalStepsEl = document.getElementById('training-total-steps');
                        if (totalStepsEl) {
                            totalStepsEl.textContent = Math.round(newTotal).toString();
                        }
                    }
                } else {
                    console.warn('Total steps hyperparameter not found in:', params.map((p: any) => p.name));
                }
            } catch (err) {
                console.warn('Could not fetch training parameters:', err);
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

                    // Synchronize plot auto-refresh with training state
                    setPlotRefreshEnabled(nextState);
                    localStorage.setItem('plot-refresh-enabled', nextState.toString());
                    console.debug(`[Refresh] Plot refresh automatically ${nextState ? 'enabled' : 'disabled'} (training ${nextState ? 'resumed' : 'paused'})`);
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
        async function fetchInitialTrainingState(retries = 25, initialDelay = 2000): Promise<boolean> {
            let delay = initialDelay;

            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    const initResp = await dataClient.experimentCommand({
                        getHyperParameters: true,
                        getInteractiveLayers: false,
                    }).response;

                    const hp = initResp.hyperParametersDescs || [];
                    const isTrainingDesc = hp.find((d: any) => d.name === 'is_training' || d.label === 'is_training');

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
                    if (attempt < retries - 1) {
                        console.log(`Retry ${attempt + 1}/${retries} to fetch training state in ${delay}ms...`);

                        // Show visual feedback that we're retrying in the separate status label
                        if (connectionStatusElement) {
                            connectionStatusElement.textContent = `Connecting... (${attempt + 1}/${retries})`;
                        }
                        if (trainingStatePill) {
                            trainingStatePill.classList.add('pill-paused');
                                // Ensure pill respects dark mode during connection
                                if (document.body.classList.contains('dark-mode')) {
                                    trainingStatePill.style.color = 'var(--primary-text-color, #fff)';
                                    trainingStatePill.style.backgroundColor = 'var(--secondary-bg-color, #2a2a2a)';
                                }
                        }
                            // Ensure button respects dark mode during connection
                            if (toggleBtn) {
                                toggleBtn.style.color = 'var(--primary-text-color, inherit)';
                                if (document.body.classList.contains('dark-mode')) {
                                    toggleBtn.style.backgroundColor = 'var(--secondary-bg-color, #2a2a2a)';
                                    toggleBtn.style.borderColor = 'var(--border-color, #444)';
                                }
                            }

                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    } else {
                        console.warn(`Failed to fetch training state after ${retries} attempts`, e);

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

        // Poll is_training hyperparameter every 3 seconds to keep UI in sync
        setInterval(async () => {
            try {
                const cmd = {
                    getHyperParameters: true,
                    getInteractiveLayers: false,
                };
                const resp = await dataClient.experimentCommand(cmd).response;
                const hp = resp.hyperParametersDescs || [];
                const isTrainingDesc = hp.find((d: any) => d.name === 'is_training' || d.label === 'is_training');

                if (isTrainingDesc) {
                    let fetchedState = false;
                    // Bool may come as stringValue ('true'/'false') or numericalValue (1/0)
                    if (typeof isTrainingDesc.stringValue === 'string') {
                        fetchedState = isTrainingDesc.stringValue.toLowerCase() === 'true';
                    } else if (typeof isTrainingDesc.numericalValue === 'number') {
                        fetchedState = isTrainingDesc.numericalValue !== 0;
                    }

                    // Update UI if state changed
                    if (isTraining !== fetchedState) {
                        isTraining = fetchedState;
                        syncTrainingUI();
                        localStorage.setItem('training-state', String(fetchedState));
                        console.log(`Training state updated from server poll: ${fetchedState}`);
                    }
                }
            } catch (e) {
                console.debug('Failed to poll is_training hyperparameter:', e);
            }
        }, 3000); // Poll every 3 seconds
    }

    // Initialize display options panel
    const detailsOptionsRow = document.querySelector('.details-options-row') as HTMLElement;
    if (detailsOptionsRow) {
        displayOptionsPanel = new DataDisplayOptionsPanel(detailsOptionsRow);
        displayOptionsPanel.onSort(async (query) => {
            // Bypass agent for deterministic response (sorting)
            await handleQuerySubmit(query, false);
        });
        displayOptionsPanel.initialize();

        // Register dependencies with gridDataManager for data fetching
        fetchSamples = async (request: DataSamplesRequest): Promise<DataSamplesResponse> => {
            try {
                const response = await dataClient.getDataSamples(request).response;
                return response;
            } catch (error: any) {
                if (error instanceof RpcError) {
                    console.error(
                        `gRPC Error fetching samples (Method: ${error.methodName}, Service: ${error.serviceName}): ${error.message}`,
                        `Original error:`, error
                    );
                } else {
                    console.error("Error fetching samples:", error);
                }
                throw error;
            }
        };

        // Register gridDataManager dependencies will happen later after gridManager is created
        // await gridDataManager.fetchAndCreateSplitColorPickers(dataClient);

    }

    // Initialize Collapsible Widgets
    const setupCollapse = (btnId: string, cardSelector: string) => {
        const btn = document.getElementById(btnId);
        const card = document.querySelector(cardSelector);
        if (btn && card) {
            // Ensure button type is button to prevent form submission
            if (btn instanceof HTMLButtonElement) btn.type = 'button';

            // Initialize button with correct icon based on current state
            const isCurrentlyCollapsed = card.classList.contains('collapsed');
            btn.innerHTML = isCurrentlyCollapsed ? PLUS_ICON : MINUS_ICON;
            btn.title = isCurrentlyCollapsed ? 'Maximize' : 'Minimize';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isCollapsed = card.classList.toggle('collapsed');
                btn.innerHTML = isCollapsed ? PLUS_ICON : MINUS_ICON;
                btn.title = isCollapsed ? 'Maximize' : 'Minimize';
                // Trigger layout update
                setTimeout(() => gridDataManager.updateLayout(), 150);
            });
        }
    };

    setupCollapse('training-collapse-btn', '.training-card');
    setupCollapse('tags-collapse-btn', '.tagger-card');
    setupCollapse('details-toggle', '#options-panel');

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
            gridDataManager.updateDisplayOnly();
        });
    }
    if (evalColorInput) {
        evalColorInput.addEventListener('input', () => {
            localStorage.setItem('eval-color', evalColorInput.value);
            gridDataManager.updateDisplayOnly();
        });
    }

    // Checkbox changes only need display update, not layout recalculation
    if (displayOptionsPanel) {
        displayOptionsPanel.onUpdate(() => gridDataManager.updateDisplayOnly());
    }

    // Grid settings toggle functionality
    const gridSettingsToggle = document.getElementById('grid-settings-toggle') as HTMLButtonElement;
    const gridSettingsOverlay = document.getElementById('grid-settings-overlay') as HTMLElement;

    if (gridSettingsToggle && gridSettingsOverlay) {
        gridSettingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = gridSettingsOverlay.classList.toggle('collapsed');
            gridSettingsToggle.classList.toggle('active', !isCollapsed);
        });
    }

    // Restore grid settings from localStorage before initialization
    restoreGridSettings();

    traversalPanel.initialize();
    traversalPanel.setupKeyboardShortcuts();
    gridManager = new GridManager(
        cellsContainer, traversalPanel,
        displayOptionsPanel as DataDisplayOptionsPanel);

    // Wait for left panel layout to settle, then calculate grid dimensions
    // This ensures the grid container has its final width after left panel is rendered
    await new Promise(resolve => {
        // Wait for next animation frame to ensure layout is painted
        requestAnimationFrame(() => {
            setTimeout(resolve, 50);
        });
    });

    // Force a reflow and log dimensions for debugging
    const inspectorWidth = inspectorContainer?.offsetWidth || 0;
    const gridContainerWidth = cellsContainer?.clientWidth || 0;
    console.log(`[Init] Left panel width: ${inspectorWidth}px, Grid container width: ${gridContainerWidth}px`);

    // Initialize grid layout BEFORE setting up any data fetching to ensure proper dimensions
    gridManager.updateGridLayout();
    const initialGridDims = gridManager.calculateGridDimensions();
    traversalPanel.updateSliderStep(initialGridDims.gridCount);
    console.log(`[Init] Initial grid dimensions set: ${JSON.stringify(initialGridDims)}`);

    // Now that gridManager is initialized, register it with gridDataManager
    gridDataManager.registerFetchDependencies(
        fetchSamples!,
        async () => {
            // Refresh grid display without re-fetching or triggering callbacks
            gridDataManager.refreshGridDisplay();
        },
        gridManager,
        traversalPanel,
        displayOptionsPanel,
        () => datasetInfoReady,
        locallyDiscardedSampleIds,
        locallyRestoredSampleIds
    );

        // Fetch splits from backend (if supported) and build color pickers dynamically
        await gridDataManager.fetchAndCreateSplitColorPickers(dataClient);

        // Helper to get a valid split/origin for DataSamples requests
        function getValidOrigin(requestedOrigin) {
            const splits = gridDataManager.getAvailableSplits();
            if (!requestedOrigin || !splits.includes(requestedOrigin)) {
                return splits.length > 0 ? splits[0] : 'train';
            }
            return requestedOrigin;
        }

        // Patch fetchSamples to always use a valid origin
        const originalFetchSamples = fetchSamples;
        fetchSamples = async (request) => {
            if ('origin' in request) {
                request.origin = getValidOrigin(request.origin);
            } else if ('sampleOrigins' in request && Array.isArray(request.sampleOrigins)) {
                request.sampleOrigins = request.sampleOrigins.filter(o => !!o && gridDataManager.getAvailableSplits().includes(o));
                if (request.sampleOrigins.length === 0) {
                    request.sampleOrigins = [gridDataManager.getAvailableSplits()[0] || 'train'];
                }
            }
            return originalFetchSamples ? originalFetchSamples(request) : Promise.reject('fetchSamples not initialized');
        };

    traversalPanel.onUpdate(() => {
        gridDataManager.debouncedFetchAndDisplay(() => gridDataManager.fetchAndDisplaySamples());
        gridDataManager.debouncedFetchAndDisplay(() => gridDataManager.updateLayout());
    });

    window.addEventListener('resize', () => {
        gridDataManager.updateLayout();
        saveGridSettings();
    });

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
        datasetInfoReady = true;
    } catch (error) {
        console.error('Error fetching sample count or stats:', error);
        // traversalPanel.setMaxSampleId(0);
        traversalPanel.updateSampleCounts(
            0, 0
        );
        datasetInfoReady = true;
    }

    // Save grid settings before page unload
    window.addEventListener('beforeunload', saveGridSettings);

    // Auto-refresh setup with configurable interval
    let refreshIntervalId: any = null;
    let refreshIntervalMs = parseInt(localStorage.getItem('refresh-interval') || '30000');
    // Initialize plot refresh settings from localStorage
    setPlotRefreshEnabled(localStorage.getItem('plot-refresh-enabled') === 'true');
    setPlotRefreshIntervalMs(parseInt(localStorage.getItem('plot-refresh-interval-ms') || '2000'));

    function startRefreshInterval() {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }

        const refreshBtn = document.getElementById('refresh-stats');
        if (refreshBtn) {
            refreshBtn.classList.toggle('is-polling', refreshIntervalMs > 0);
        }

        if (refreshIntervalMs > 0) {
            refreshIntervalId = setInterval(() => {
                refreshDynamicStatsOnly();
            }, refreshIntervalMs);
            console.debug(`[Refresh] Interval set to ${refreshIntervalMs}ms`);
        }
    }

    startRefreshInterval();

    // Refresh button setup
    const refreshBtn = document.getElementById('refresh-stats') as HTMLButtonElement;
    if (refreshBtn) {
        // Left click: Trigger refresh now and reset timer
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.debug('[Refresh] Manual refresh triggered');
            refreshDynamicStatsOnly();
            startRefreshInterval(); // Reset the timer
        });

        // Right click OR Clock click: Configure interval (Custom Popover)
        const refreshPopover = document.getElementById('refresh-config-popover');
        const refreshInput = document.getElementById('refresh-interval-input') as HTMLInputElement;
        const refreshAutoToggle = document.getElementById('refresh-auto-toggle') as HTMLInputElement;
        const refreshInputWrapper = document.getElementById('refresh-input-wrapper');
        const refreshSaveBtn = document.getElementById('refresh-config-save');
        const refreshTrigger = document.getElementById('refresh-config-trigger');

        const plotInput = document.getElementById('plot-interval-input') as HTMLInputElement;
        const plotRefreshToggle = document.getElementById('plot-refresh-toggle') as HTMLInputElement;
        const plotInputWrapper = document.getElementById('plot-input-wrapper');
        const plotSaveBtn = document.getElementById('plot-config-save');

        const openConfig = (e: Event) => {
            e.preventDefault();
            if (refreshPopover && refreshInput && refreshAutoToggle) {
                const currentSeconds = Math.round(refreshIntervalMs / 1000);
                const currentPlotSeconds = Math.round(getPlotRefreshIntervalMs() / 1000);

                // Initialize data refresh UI state
                refreshAutoToggle.checked = refreshIntervalMs > 0;
                refreshInput.value = currentSeconds > 0 ? currentSeconds.toString() : "5";

                // Initialize plot refresh UI state
                if (plotRefreshToggle && plotInput) {
                    plotRefreshToggle.checked = getPlotRefreshEnabled();
                    plotInput.value = currentPlotSeconds > 0 ? currentPlotSeconds.toString() : "2";
                }

                if (refreshInputWrapper) {
                    refreshInputWrapper.classList.toggle('disabled', !refreshAutoToggle.checked);
                }

                if (plotInputWrapper && plotRefreshToggle) {
                    plotInputWrapper.classList.toggle('disabled', !plotRefreshToggle.checked);
                }

                refreshPopover.classList.remove('hidden');

                if (refreshAutoToggle.checked) {
                    refreshInput.focus();
                    refreshInput.select();
                }
            }
        };

        if (refreshTrigger) {
            refreshTrigger.addEventListener('click', openConfig);
        }

        if (refreshAutoToggle && refreshInputWrapper) {
            refreshAutoToggle.addEventListener('change', () => {
                refreshInputWrapper.classList.toggle('disabled', !refreshAutoToggle.checked);
            });
        }

        if (plotRefreshToggle && plotInputWrapper) {
            plotRefreshToggle.addEventListener('change', () => {
                plotInputWrapper.classList.toggle('disabled', !plotRefreshToggle.checked);
            });
        }

        // Data refresh save button
        if (refreshSaveBtn && refreshPopover && refreshInput && refreshAutoToggle) {
            refreshSaveBtn.addEventListener('click', () => {
                if (!refreshAutoToggle.checked) {
                    refreshIntervalMs = 0;
                } else {
                    const newSeconds = parseInt(refreshInput.value);
                    if (!isNaN(newSeconds) && newSeconds > 0) {
                        refreshIntervalMs = newSeconds * 1000;
                    } else {
                        refreshIntervalMs = 5000;
                    }
                }

                localStorage.setItem('refresh-interval', refreshIntervalMs.toString());
                startRefreshInterval();
                console.debug(`[Refresh] Data refresh interval set to ${refreshIntervalMs}ms`);
            });

            // Close on Escape or Save on Enter
            refreshInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') refreshSaveBtn.click();
                if (e.key === 'Escape') refreshPopover.classList.add('hidden');
            });
        }

        // Plot refresh save button
        if (plotSaveBtn && refreshPopover && plotInput && plotRefreshToggle) {
            plotSaveBtn.addEventListener('click', () => {
                const plotRefreshState = plotRefreshToggle.checked;
                setPlotRefreshEnabled(plotRefreshState);

                if (plotRefreshState) {
                    const newSeconds = parseInt(plotInput.value);
                    if (!isNaN(newSeconds) && newSeconds >= 2) {
                        setPlotRefreshIntervalMs(newSeconds * 1000);
                    } else {
                        setPlotRefreshIntervalMs(2000); // Minimum 2 seconds
                    }
                }

                localStorage.setItem('plot-refresh-enabled', plotRefreshState.toString());
                localStorage.setItem('plot-refresh-interval-ms', getPlotRefreshIntervalMs().toString());
                console.debug(`[Refresh] Plot refresh ${plotRefreshState ? 'enabled' : 'disabled'}, interval: ${getPlotRefreshIntervalMs()}ms`);
            });

            // Close on Escape or Save on Enter
            plotInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') plotSaveBtn.click();
                if (e.key === 'Escape') refreshPopover.classList.add('hidden');
            });
        }

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            const isOutsidePopover = refreshPopover && !refreshPopover.contains(e.target as Node);
            const isNotMainBtn = refreshBtn !== e.target && !refreshBtn.contains(e.target as Node);
            const isNotTrigger = refreshTrigger !== e.target && !refreshTrigger?.contains(e.target as Node);

            if (isOutsidePopover && isNotMainBtn && isNotTrigger) {
                refreshPopover.classList.add('hidden');
            }
        });

        // Clear cache and refresh button
        const clearCacheRefreshBtn = document.getElementById('clear-cache-refresh-btn');
        if (clearCacheRefreshBtn) {
            clearCacheRefreshBtn.addEventListener('click', () => {
                console.log('[Cache] Clearing localStorage and refreshing page...');

                // Clear all localStorage (including branch colors, settings, etc.)
                localStorage.clear();

                // Clear session storage
                sessionStorage.clear();

                // Force reload the page (bypassing cache)
                window.location.reload();
            });
        }
    }

    setTimeout(() => gridDataManager.updateLayout(), 0);

    // Painter Mode UI Initialization
    const painterToggle = document.getElementById('painter-toggle') as HTMLInputElement;
    const painterTagsList = document.getElementById('painter-tags-list') as HTMLElement;
    const painterNewTagBtn = document.getElementById('painter-new-tag') as HTMLButtonElement;
    const newTagInput = document.getElementById('new-tag-input') as HTMLInputElement;
    const modeSwitcherContainer = document.getElementById('mode-switcher-container') as HTMLElement;

    if (painterToggle) {
        painterToggle.addEventListener('change', () => {
            const isPainterMode = leftPanel.getPainterMode();

            // Show/hide the mode switcher (+/-) based on Painter toggle
            if (modeSwitcherContainer) {
                modeSwitcherContainer.style.display = isPainterMode ? 'flex' : 'none';
            }

            // Enable/disable tag interactions based on mode
            if (isPainterMode) {
                cellsContainer?.classList.add('painter-active');
                clearSelection();

                // If no brush active, auto-select first one
                const activeBrushTags = leftPanel.getActiveBrushTags();
                if (activeBrushTags.size === 0 && uniqueTags.length > 0) {
                    leftPanel.setActiveBrush(uniqueTags[0]);
                }
            } else {
                cellsContainer?.classList.remove('painter-active');
            }
        });
    }

    const addNewTag = () => {
        if (!newTagInput) return;

        const newTag = newTagInput.value.trim();
        if (newTag) {
            // Add to list and select it
            if (!uniqueTags.includes(newTag)) {
                updateUniqueTags([...uniqueTags, newTag].sort());
            }

            // Create a manual tag chip if it doesn't exist
            const tagsContainer = document.getElementById('painter-tags-list');
            if (tagsContainer) {
                let existingChip = Array.from(tagsContainer.querySelectorAll('.tag-chip')).find(
                    chip => (chip as HTMLElement).textContent === newTag
                );

                if (!existingChip) {
                    const chip = document.createElement('div');
                    chip.className = 'tag-chip';
                    chip.dataset.manual = 'true'; // Mark as manually added
                    chip.dataset.tag = newTag;
                    chip.textContent = newTag;
                    chip.onclick = (e) => {
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

            // Clear input
            newTagInput.value = '';
        }
    };

    if (painterNewTagBtn) {
        painterNewTagBtn.addEventListener('click', addNewTag);
    }

    if (newTagInput) {
        newTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewTag();
            }
        });
    }

    // Mode switcher (Add/Remove)
    const modeAddBtn = document.getElementById('mode-add') as HTMLButtonElement;
    const modeRemoveBtn = document.getElementById('mode-remove') as HTMLButtonElement;

    if (modeAddBtn && modeRemoveBtn) {
        modeAddBtn.addEventListener('click', () => {
            // isPainterRemoveMode managed by leftPanel module
            modeAddBtn.classList.add('active');
            modeAddBtn.classList.remove('remove-mode');
            modeRemoveBtn.classList.remove('active', 'remove-mode');
        });

        modeRemoveBtn.addEventListener('click', () => {
            // isPainterRemoveMode managed by leftPanel module
            modeRemoveBtn.classList.add('active', 'remove-mode');
            modeAddBtn.classList.remove('active');
        });
    }
}

// ===== TRAINING PROGRESS STREAM =====
let isStreamRunning = false;
let trackedSignals: Set<string> = new Set();

/**
 * Update training UI without making server calls
 * Used when connection is lost to set paused state
 */
function updateTrainingUI(): void {
    const toggleBtn = document.getElementById('toggle-training') as HTMLButtonElement | null;
    if (toggleBtn) {
        toggleBtn.textContent = isTraining ? 'Pause' : 'Resume';
        toggleBtn.classList.toggle('running', isTraining);
        toggleBtn.classList.toggle('paused', !isTraining);
    }
    if (trainingStatePill) {
        trainingStatePill.classList.toggle('pill-running', isTraining);
        trainingStatePill.classList.toggle('pill-paused', !isTraining);
    }
}

async function startTrainingStatusStream() {
    // Prevent multiple concurrent streams
    if (isStreamRunning) {
        console.log('Training status stream is already running');
        return;
    }

    const currentStepEl = document.getElementById('training-current-step');
    const progressBarEl = document.getElementById('training-progress-bar');
    const percentageEl = document.getElementById('training-percentage-text');
    const metricsEl = document.getElementById('training-metrics');

    if (!currentStepEl || !progressBarEl || !percentageEl || !metricsEl) {
        console.warn('One or more progress UI elements not found, delay starting stream');
        setTimeout(startTrainingStatusStream, 1000);
        return;
    }

    // Define helper functions for UI updates
    const updateProgress = (modelAge: number) => {
        if ((window as any).trainingTotalSteps) {
            const total = (window as any).trainingTotalSteps;
            const percent = Math.min(100, (modelAge / total) * 100);
            if (progressBarEl) {
                progressBarEl.style.width = `${percent}%`;
            }
            if (percentageEl) {
                percentageEl.textContent = `${Math.round(percent)}%`;
            }
        }
        if (currentStepEl) {
            currentStepEl.textContent = String(modelAge);
        }
    };

    const updateMetrics = () => {
        if (!metricsEl) return;
        const metricsHtml = Array.from(latestMetrics.entries())
            .map(([name, data]) => `<div><strong>${name}:</strong> ${data.value.toFixed(4)}</div>`)
            .join('');
        metricsEl.innerHTML = metricsHtml;
        // Ensure text is white in dark mode
        metricsEl.style.color = 'var(--primary-text-color, #fff)';
    };

    // Get plot refresh interval from localStorage or use default (2 seconds)
    const getPlotRefreshInterval = (): number => {
        // If plot refresh is disabled, return a very large number to effectively disable it
        if (!getPlotRefreshEnabled()) {
            return 999999999;  // ~11 days, effectively disabled
        }
        return getPlotRefreshIntervalMs();
    };

    let POLL_INTERVAL_MS = getPlotRefreshInterval();
    let lastRefreshIntervalCheck = Date.now();
    const REFRESH_INTERVAL_CHECK_MS = 1000;  // Check for interval changes every 1 second

    // Get max points from environment variable or use default
    const getMaxPoints = (): number => {
        const envValue = (window as any).WS_PLOT_MAX_POINTS_REQUEST;
        if (envValue !== undefined && envValue !== null) {
            const parsed = parseInt(String(envValue), 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 1000;  // Default value
    };

    async function pollLoggerData() {
        // Skip polling if training is paused OR plot refresh is disabled
        if (!isTraining || !getPlotRefreshEnabled()) {
            return;
        }

        // Check if refresh interval has changed and update polling
        const now = Date.now();
        if (now - lastRefreshIntervalCheck > REFRESH_INTERVAL_CHECK_MS) {
            const newInterval = getPlotRefreshInterval();
            if (newInterval !== POLL_INTERVAL_MS) {
                console.log(`📊 Poll interval changed from ${POLL_INTERVAL_MS}ms to ${newInterval}ms`);
                POLL_INTERVAL_MS = newInterval;
                lastRefreshIntervalCheck = now;
            }
        }

        try {
            await ensureTotalSteps();

            // Request full history on first poll, then only queue updates
            const requestFullHistory = isFirstPoll;
            const maxPoints = getMaxPoints();  // Max points per signal for full history

            const resp = await dataClient.getLatestLoggerData({
                requestFullHistory,
                maxPoints
            }).response;

            const points = resp.points || [];

            if (points.length === 0) {
                console.debug(requestFullHistory ? 'No history available yet' : 'No new data in queue');
                if (isFirstPoll) {
                    isFirstPoll = false;  // Move to incremental mode even if no data
                }
                return;
            }

            console.log(`📊 Received ${points.length} points (${requestFullHistory ? 'full history' : 'queue'})`);

            // Group points by metric_name
            const signalGroups = new Map<string, typeof points>();

            for (const pt of points) {
                const metricName = pt.metricName || 'unknown';
                if (!signalGroups.has(metricName)) {
                    signalGroups.set(metricName, []);
                    // Track this signal
                    if (!trackedSignals.has(metricName)) {
                        trackedSignals.add(metricName);
                        console.log(`📊 Discovered signal: ${metricName}`);
                    }
                }
                signalGroups.get(metricName)!.push(pt);
            }

            // Process each signal group
            for (const [metricName, signalPoints] of signalGroups.entries()) {
                const entry = plotsManager.getOrCreateSignalChart(metricName);
                if (!entry) continue;

                const mapped = signalPoints.map((pt: any) => ({
                    x: pt.modelAge,
                    y: pt.metricValue,
                    experimentHash: pt.experimentHash,
                })).sort((a: any, b: any) => a.x - b.x);

                // Log the step range for this batch
                if (mapped.length > 0) {
                    const minStep = mapped[0].x;
                    const maxStep = mapped[mapped.length - 1].x;
                    console.log(`📊 ${metricName} plot update from ${minStep} to ${maxStep} steps (${mapped.length} points)`);
                }

                if (requestFullHistory || entry.branches[entry.branches.length - 1].rawPoints.length === 0) {
                    // Full history: group by hash to create clean branches
                    if (justRestoredCheckpoint) {
                        // Create new branch for post-restore training
                        const newHash = mapped.length > 0 ? mapped[0].experimentHash : undefined;

                        // IMPORTANT: Remove any existing branches with the same hash after the restore point
                        // This prevents duplicate markers and branch confusion after restore
                        if (newHash && mapped.length > 0) {
                            const restoreStep = mapped[0].x;
                            entry.branches = entry.branches.filter((branch: any) => {
                                // Keep branches with different hashes
                                if (branch.experimentHash !== newHash) return true;

                                // For branches with same hash, only keep if all points are before restore point
                                const allPointsBeforeRestore = branch.rawPoints.every((pt: any) => pt.x < restoreStep);
                                if (!allPointsBeforeRestore) {
                                    // Truncate points after restore step
                                    branch.rawPoints = branch.rawPoints.filter((pt: any) => pt.x < restoreStep);
                                    return branch.rawPoints.length > 0;
                                }
                                return true;
                            });
                            console.log(`📊 ${metricName}: Cleaned up duplicate branches with hash ${newHash.substring(0, 8)}... before restore at step ${restoreStep}`);
                        }

                        const savedColor = gridDataManager.loadBranchColor(newHash);
                        const newBranch: SignalBranch = {
                            rawPoints: mapped,
                            branchId: nextBranchId++,
                            experimentHash: newHash,
                            customColor: savedColor
                        };
                        entry.branches.push(newBranch);
                        console.log(`📊 ${metricName}: Created new branch ${newBranch.branchId} with ${mapped.length} points (hash: ${newHash?.substring(0, 8)}...)${savedColor ? ' (loaded saved color)' : ''}`);
                    } else {
                        // Normal full history: group points by hash to avoid markers on every hash change
                        const hashGroups = new Map<string, typeof mapped>();
                        const hashOrder: string[] = [];

                        for (const pt of mapped) {
                            const hash = pt.experimentHash || 'unknown';
                            if (!hashGroups.has(hash)) {
                                hashGroups.set(hash, []);
                                hashOrder.push(hash);
                            }
                            hashGroups.get(hash)!.push(pt);
                        }

                        console.log(`📊 ${metricName}: Full history with ${hashGroups.size} unique hashes`);

                        // Clear existing branches and create one branch per hash group
                        entry.branches = [];

                        for (const hash of hashOrder) {
                            const hashPoints = hashGroups.get(hash)!;
                            const expHash = hash !== 'unknown' ? hash : undefined;
                            const savedColor = gridDataManager.loadBranchColor(expHash);
                            const newBranch: SignalBranch = {
                                rawPoints: hashPoints,
                                branchId: nextBranchId++,
                                experimentHash: expHash,
                                customColor: savedColor
                            };
                            entry.branches.push(newBranch);
                            console.log(`📊 ${metricName}: Branch ${newBranch.branchId} with ${hashPoints.length} points (hash: ${hash.substring(0, 8)}...)${savedColor ? ' (loaded saved color)' : ''}`);
                        }
                    }
                } else {
                    // Incremental: check if hash changed (new training branch detected)
                    const currentBranch = entry.branches[entry.branches.length - 1];
                    const lastX = currentBranch.rawPoints[currentBranch.rawPoints.length - 1]?.x ?? -Infinity;

                    // Check if incoming data has a different hash (indicates checkpoint restore or divergence)
                    const incomingHash = mapped.length > 0 ? mapped[0].experimentHash : undefined;
                    const currentHash = currentBranch.experimentHash || currentBranch.rawPoints[currentBranch.rawPoints.length - 1]?.experimentHash;

                    if (incomingHash && currentHash && incomingHash !== currentHash) {
                        // Hash changed - create new branch for diverged training
                        const savedColor = gridDataManager.loadBranchColor(incomingHash);
                        const newBranch: SignalBranch = {
                            rawPoints: mapped,
                            branchId: nextBranchId++,
                            experimentHash: incomingHash,
                            customColor: savedColor
                        };
                        entry.branches.push(newBranch);
                        console.log(`📊 ${metricName}: Hash changed (${currentHash.substring(0, 8)}... → ${incomingHash.substring(0, 8)}...), created branch ${newBranch.branchId}${savedColor ? ' (loaded saved color)' : ''}`);
                    } else {
                        // Same hash - add points to current branch
                        mapped.forEach((p: any) => {
                            if (p.x > lastX) {
                                currentBranch.rawPoints.push(p);
                            }
                        });
                    }
                }

                // Limit history size per branch
                entry.branches.forEach((branch: any) => {
                    if (branch.rawPoints.length > SIGNAL_HISTORY_LIMIT) {
                        branch.rawPoints.splice(0, branch.rawPoints.length - SIGNAL_HISTORY_LIMIT);
                    }
                });

                // Update metrics and progress (use latest point from latest branch)
                const currentBranch = entry.branches[entry.branches.length - 1];
                if (currentBranch.rawPoints.length > 0) {
                    const latest = currentBranch.rawPoints[currentBranch.rawPoints.length - 1];
                    updateProgress(latest.x);
                    // Track metric with timestamp: only show metrics updated in current poll
                    latestMetrics.set(metricName, { value: latest.y, timestamp: Date.now() });
                }

                // Refresh chart immediately for this metric
                plotsManager.refreshSignalChart(entry, metricName, metricName);
                entry.chart.update('none');

                // Count total points across all branches for logging
                const totalPoints = entry.branches.reduce((sum, b) => sum + b.rawPoints.length, 0);
                console.log(`📊 Chart updated for ${metricName} with ${totalPoints} total points across ${entry.branches.length} branches`);
            }

            // After first successful poll, switch to incremental mode
            if (isFirstPoll) {
                isFirstPoll = false;
                console.log('📊 Switched to incremental polling mode');
            }

            // Reset checkpoint restore flag after processing new data
            if (justRestoredCheckpoint) {
                justRestoredCheckpoint = false;
                console.log('📊 Checkpoint restore data merged into plots');
            }

            // Update metrics display
            updateMetrics();
        } catch (err) {
            // Connection error - graceful handling
            // Silently skip this poll if server is unavailable
            // Set training status to paused when connection is lost
            if (isTraining) {
                isTraining = false;
                updateTrainingUI();
            }
        }
    }

    // Recursive polling with dynamic interval support
    async function setupPolling() {
        await pollLoggerData();
        setTimeout(setupPolling, POLL_INTERVAL_MS);
    }

    // Fetch initial history on page load, regardless of training state
    async function fetchInitialHistory() {
        try {
            console.log('📊 Fetching initial plot history on page load...');
            await ensureTotalSteps();

            const maxPoints = getMaxPoints();
            const resp = await dataClient.getLatestLoggerData({
                requestFullHistory: true,
                maxPoints
            }).response;

            const points = resp.points || [];

            if (points.length === 0) {
                console.log('📊 No history available on page load');
                isFirstPoll = false;  // Move to incremental mode
                return;
            }

            console.log(`📊 Loaded ${points.length} historical points on page load`);

            // Group points by metric_name
            const signalGroups = new Map<string, typeof points>();

            for (const pt of points) {
                const metricName = pt.metricName || 'unknown';
                if (!signalGroups.has(metricName)) {
                    signalGroups.set(metricName, []);
                    // Track this signal
                    if (!trackedSignals.has(metricName)) {
                        trackedSignals.add(metricName);
                        console.log(`📊 Discovered signal: ${metricName}`);
                    }
                }
                signalGroups.get(metricName)!.push(pt);
            }

            // Process each signal group
            for (const [metricName, signalPoints] of signalGroups.entries()) {
                const entry = plotsManager.getOrCreateSignalChart(metricName);
                if (!entry) continue;

                const mapped = signalPoints.map((pt: any) => ({
                    x: pt.modelAge,
                    y: pt.metricValue,
                    experimentHash: pt.experimentHash,
                })).sort((a: any, b: any) => a.x - b.x);

                // Group points by hash to create separate branches
                const hashGroups = new Map<string, typeof mapped>();
                const hashOrder: string[] = []; // Track order of first appearance

                for (const pt of mapped) {
                    const hash = pt.experimentHash || 'unknown';
                    if (!hashGroups.has(hash)) {
                        hashGroups.set(hash, []);
                        hashOrder.push(hash);
                    }
                    hashGroups.get(hash)!.push(pt);
                }

                console.log(`📊 ${metricName}: Found ${hashGroups.size} unique hashes in history`);

                // Clear existing branches and create one branch per hash group
                entry.branches = [];

                for (const hash of hashOrder) {
                    const hashPoints = hashGroups.get(hash)!;
                    const expHash = hash !== 'unknown' ? hash : undefined;
                    const savedColor = gridDataManager.loadBranchColor(expHash);
                    const newBranch: SignalBranch = {
                        rawPoints: hashPoints,
                        branchId: nextBranchId++,
                        experimentHash: expHash,
                        customColor: savedColor
                    };
                    entry.branches.push(newBranch);
                    console.log(`📊 ${metricName}: Branch ${newBranch.branchId} with ${hashPoints.length} points (hash: ${hash.substring(0, 8)}...)${savedColor ? ' (loaded saved color)' : ''}`);
                }

                // Update metrics and progress (use latest point from latest branch)
                const lastBranch = entry.branches[entry.branches.length - 1];
                if (lastBranch.rawPoints.length > 0) {
                    const latest = lastBranch.rawPoints[lastBranch.rawPoints.length - 1];
                    updateProgress(latest.x);
                    latestMetrics.set(metricName, { value: latest.y, timestamp: Date.now() });
                }

                // Refresh chart
                plotsManager.refreshSignalChart(entry, metricName, metricName);
                entry.chart.update('none');

                const totalPoints = entry.branches.reduce((sum: any, b: any) => sum + b.rawPoints.length, 0);
                console.log(`📊 Chart initialized for ${metricName} with ${totalPoints} points across ${entry.branches.length} branches`);
            }

            // Update metrics display
            updateMetrics();

            // Mark first poll as done to switch to incremental mode
            isFirstPoll = false;
            console.log('📊 Switched to incremental polling mode');
        } catch (err) {
            console.debug('Error fetching initial history:', err);
            isFirstPoll = false;  // Move to incremental mode on error
        }
    }

    // Fetch initial history on page load, then start polling
    fetchInitialHistory().then(() => {
        setupPolling();
    });

    async function ensureTotalSteps() {
        if ((window as any).trainingTotalSteps) return true;
        try {
            const resp = await dataClient.experimentCommand({ getHyperParameters: true, getInteractiveLayers: false }).response;
            const params = resp.hyperParametersDescs || [];
            const stepsParam = params.find((p: any) => p.name === 'total_training_steps') ||
                params.find((p: any) =>
                    p.name === 'training_left' ||
                    p.name === 'training_steps_to_do' ||
                    p.label === 'Left Training Steps' ||
                    p.label === 'training_steps_to_do'
                );

            if (stepsParam && stepsParam.numericalValue) {
                const total = stepsParam.numericalValue;
                (window as any).trainingTotalSteps = total;
                const totalStepsEl = document.getElementById('training-total-steps');
                if (totalStepsEl) {
                    totalStepsEl.textContent = Math.round(total).toString();
                }
                return true;
            }
        } catch (err) {
            // Silently fail - server may be disconnected
            console.debug('Could not fetch total steps (server may be unavailable)');
        }
        return false;
    }

    console.log('🚀 Starting training status polling...');

    plotsManager.startSignalUpdateLoop();

    // Polling loop runs as long as the stream is "active"
    // Note: We're now using polling exclusively, no streaming
    await ensureTotalSteps();
}


// =============================================================================

const grid = document.getElementById('cells-grid') as HTMLElement;
const contextMenu = document.getElementById('context-menu') as HTMLElement;

// selectedCells is now declared at module scope near the top

// Helper functions are now in helpers module and imported above

grid.addEventListener('mousedown', (e) => {
    // Hide context menu on any new selection action
    hideContextMenu();

    // Prevent default browser drag behavior and text selection
    e.preventDefault();

    const target = e.target as HTMLElement;
    const cell = target.closest('.cell') as HTMLElement | null;

    // On a mousedown without Ctrl, if the click is not on an already selected cell,
    // clear the existing selection. This prepares for a new selection (either click or drag).
    if (!leftPanel.getPainterMode() && !e.ctrlKey && !e.metaKey) {
        if (!cell || !selectedCells.has(cell)) {
            clearSelection();
        }
    }

    // Start dragging
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    if (leftPanel.getPainterMode()) {
        // Painter Mode: Apply tag immediately on click/down
        if (cell) {
            paintCell(cell);
        }
    } else {
        // Normal Mode: Start selection box
        const box = ensureSelectionBox();
        box.style.left = `${startX}px`;
        box.style.top = `${startY}px`;
        box.style.width = '0px';
        box.style.height = '0px';
        box.style.display = 'block';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    if (leftPanel.getPainterMode()) {
        // Painter Mode: Paint cells as we drag over them
        const target = e.target as HTMLElement;
        const cell = target.closest('.cell') as HTMLElement | null;
        if (cell) {
            paintCell(cell);
        }
        return;
    }

    if (!selectionBox) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    const box = ensureSelectionBox();
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    const selectionRect = box.getBoundingClientRect();

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
            // Cache sample data during drag selection
            const sampleData = extractSampleData(cellElem);
            if (sampleData && !selectedSampleData.has(cellElem)) {
                selectedSampleData.set(cellElem, sampleData);
            }
        } else if (!e.ctrlKey && !e.metaKey) {
            // If not holding Ctrl, deselect cells that are no longer in the rectangle.
            removeCellFromSelection(cellElem);
            selectedSampleData.delete(cellElem);
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    if (leftPanel.getPainterMode()) return; // Painter mode doesn't do selection on mouseup

    // Store the mouse up position for context menu
    lastMouseUpX = e.clientX;
    lastMouseUpY = e.clientY;

    if (selectionBox) {
        if (selectionBox) selectionBox.style.display = 'none';

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


// Selection helper functions now in helpers module (imported above)

// Helper function to extract sample data from a cell element
function extractSampleData(cellEl: HTMLElement): { id: number; origin: string } | null {
    try {
        // Step 1: Try to get GridCell via __gridCell property
        let gridCell = getGridCell(cellEl);

        if (!gridCell) {
            console.warn('[extractSampleData] No GridCell found via getGridCell, trying direct __gridCell property');
            gridCell = (cellEl as any).__gridCell;
        }

        if (!gridCell) {
            console.warn('[extractSampleData] No GridCell found on element', cellEl);
            return null;
        }

        // Step 2: Try to get record from GridCell
        if (!gridCell.getRecord || typeof gridCell.getRecord !== 'function') {
            console.warn('[extractSampleData] GridCell does not have getRecord method', gridCell);
            return null;
        }

        const record = gridCell.getRecord();
        if (!record) {
            console.warn('[extractSampleData] getRecord() returned null/undefined');
            return null;
        }

        // Step 3: Extract sample ID
        const sampleId = record.sampleId;
        if (!sampleId && sampleId !== 0) {
            console.warn('[extractSampleData] sampleId is missing or invalid:', sampleId);
            return null;
        }

        const idNum = Number(sampleId);
        if (!Number.isFinite(idNum)) {
            console.warn('[extractSampleData] sampleId is not a valid number:', sampleId);
            return null;
        }

        // Step 4: Extract origin
        let origin = '';
        if (record.dataStats && Array.isArray(record.dataStats)) {
            const originStat = record.dataStats.find((stat: any) => stat && stat.name === 'origin');
            origin = originStat?.valueString ?? '';
        }

        console.log('[extractSampleData] Successfully extracted:', { id: idNum, origin, sampleId });
        return { id: idNum, origin };
    } catch (error) {
        console.error('[extractSampleData] Exception during extraction:', error);
        return null;
    }
}

grid.addEventListener('contextmenu', (e) => {
    console.log('[Context Menu] Right-click detected on:', e.target, 'at', e.pageX, e.pageY);
    e.preventDefault();
    const target = e.target as HTMLElement;
    // Try to find cell with both .cell and .grid-cell classes
    let cell = target.closest('.cell, .grid-cell') as HTMLElement | null;

    // If still not found, walk up manually
    if (!cell) {
        let current: HTMLElement | null = target;
        while (current && !current.classList.contains('cell') && !current.classList.contains('grid-cell')) {
            current = current.parentElement;
        }
        cell = current;
    }

    console.log('[Context Menu] Found cell:', cell);

    // Use the event's coordinates for the position
    const menuX = e.pageX;
    const menuY = e.pageY;

    if (cell) {
        console.log('[Context Menu] Showing menu at', menuX, menuY);
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+right-click: add/maintain cell in selection and show menu
            if (!cell.classList.contains('selected')) {
                addCellToSelection(cell);
            }
            // Ensure data is cached for this cell
            if (!selectedSampleData.has(cell)) {
                const sampleData = extractSampleData(cell);
                if (sampleData) {
                    selectedSampleData.set(cell, sampleData);
                    console.log('[Context Menu] Cached data for Ctrl+click:', sampleData);
                } else {
                    console.warn('[Context Menu] Failed to extract data for Ctrl+click on cell');
                }
            }
            if (selectedCells.size > 0) {
                showContextMenu(menuX, menuY);
            } else {
                hideContextMenu();
            }
        } else if (selectedCells.has(cell)) {
            // Right-click on already selected cell: keep selection, show menu
            // Ensure data is cached for ALL selected cells, not just the clicked one
            selectedCells.forEach(selectedCell => {
                if (!selectedSampleData.has(selectedCell)) {
                    const sampleData = extractSampleData(selectedCell);
                    if (sampleData) {
                        selectedSampleData.set(selectedCell, sampleData);
                        console.log('[Context Menu] Cached data for selected cell:', sampleData);
                    } else {
                        console.warn('[Context Menu] Failed to extract data for selected cell');
                    }
                }
            });
            showContextMenu(menuX, menuY);
        } else {
            // Right-click on unselected cell: clear others, select this one, show menu
            clearSelectionState();
            addCellToSelection(cell);
            const sampleData = extractSampleData(cell);
            if (sampleData) {
                selectedSampleData.set(cell, sampleData);
                console.log('[Context Menu] Cached data for single right-click selection:', sampleData);
            } else {
                console.warn('[Context Menu] Failed to extract data for single right-click on cell:', cell);
            }
            showContextMenu(menuX, menuY);
        }
    } else {
        // Right-click on empty space: clear selection and hide menu
        console.log('[Context Menu] No cell found, hiding menu');
        clearSelectionState();
        hideContextMenu();
    }
});


// hideContextMenu now imported from helpers module

document.addEventListener('click', (e) => {
    // A drag is completed on mouseup, but a click event still fires.
    // We check if the mouse moved significantly to distinguish a real click from the end of a drag.
    const movedDuringDrag = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;

    const target = e.target as HTMLElement;
    if (!target.closest('.context-menu') && !target.closest('.cell') && !isDragging && !movedDuringDrag) {
        hideContextMenu();
        clearSelectionState();
    }
});

contextMenu.addEventListener('click', async (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (action) {
        console.log('[Context Action] ========== ACTION TRIGGERED ==========');
        console.log('[Context Action] Action type:', action);
        console.log('[Context Action] Selected cells count:', selectedCells.size);
        console.log('[Context Action] Cached sample data count:', selectedSampleData.size);

        // Log detailed info about each selected cell BEFORE trying to extract
        let cellDebugInfo: any[] = [];
        selectedCells.forEach((cellEl, index) => {
            const hasGridCell = !!(cellEl as any).__gridCell;
            const gridCell = (cellEl as any).__gridCell;
            const hasCachedData = selectedSampleData.has(cellEl);

            cellDebugInfo.push({
                index,
                tagName: cellEl.tagName,
                classList: Array.from(cellEl.classList),
                hasGridCell,
                gridCellType: gridCell?.constructor?.name,
                hasGetRecord: gridCell?.getRecord ? 'yes' : 'no',
                hasCachedData,
                cachedData: hasCachedData ? selectedSampleData.get(cellEl) : null
            });
        });
        console.log('[Context Action] Cell debug info:', cellDebugInfo);

        // Build a reliable selection set from both selectedCells and cached data
        const selectionMap = new Map<number, { id: number; origin: string }>();

        // First, ensure every selected cell has cached data
        if (selectedCells.size > 0) {
            selectedCells.forEach(cellEl => {
                let data = selectedSampleData.get(cellEl);
                if (!data) {
                    const extracted = extractSampleData(cellEl);
                    if (extracted) {
                        selectedSampleData.set(cellEl, extracted);
                        data = extracted;
                        console.log('[Context Action] ✓ Extracted and cached data:', extracted);
                    } else {
                        console.error('[Context Action] ✗ Failed to extract data from cell:', cellEl);
                    }
                }
                if (data) {
                    selectionMap.set(data.id, data);
                }
            });
        }

        // Also include any cached data that isn't tied to a selected cell
        if (selectedSampleData.size > 0) {
            selectedSampleData.forEach((data) => {
                selectionMap.set(data.id, data);
                console.log('[Context Action] ✓ Using cached data:', data);
            });
        }

        const validSelections = Array.from(selectionMap.values());
        console.log('[Context Action] Valid selections:', validSelections);

        const sample_ids = validSelections.map(v => v.id);
        const origins = validSelections.map(v => v.origin);

        if (sample_ids.length === 0) {
            console.error('[Context Action] ========== NO VALID SAMPLE IDS ==========');
            console.error('[Context Action] DIAGNOSIS:', {
                selectedCellsCount: selectedCells.size,
                cachedDataCount: selectedSampleData.size,
                cellsHaveGridCell: cellDebugInfo.filter(c => c.hasGridCell).length,
                cellsHaveGetRecord: cellDebugInfo.filter(c => c.hasGetRecord === 'yes').length,
                cellsHaveCachedData: cellDebugInfo.filter(c => c.hasCachedData).length
            });
            hideContextMenu();
            return;
        }

        console.log('[Context Action] ✓ Proceeding with action:', action, 'for', sample_ids.length, 'samples');

        hideContextMenu();

        switch (action) {
            case 'add-tag':
                await ensureTrainingPaused();
                openTaggingModal(sample_ids, origins);
                // We DON'T clear selection or refresh here.
                // The modal will stay on top of the selected items.
                return;

            case 'remove-tag':
                await ensureTrainingPaused();
                await removeTag(sample_ids, origins);
                clearSelectionState();
                gridDataManager.debouncedFetchAndDisplay(() => gridDataManager.fetchAndDisplaySamples());
                break;

            case 'discard':
                await ensureTrainingPaused();
                let newlyDiscardedCount = 0;
                // Track discarded samples locally to maintain state across refreshes
                sample_ids.forEach(id => {
                    locallyDiscardedSampleIds.add(id);
                    locallyRestoredSampleIds.delete(id);
                });

                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        // Check if already discarded to avoid double counting
                        const isDiscardedStat = record?.dataStats.find((s: any) => s.name === 'deny_listed');
                        // Check both value array and valueString for compatibility
                        const isAlreadyDiscarded =
                            (isDiscardedStat?.value?.[0] === 1) ||
                            (isDiscardedStat?.valueString === '1' || isDiscardedStat?.valueString === 'true');

                        if (!isAlreadyDiscarded) {
                            newlyDiscardedCount++;
                        }

                        gridCell.updateStats({ deny_listed: 1 });
                    }
                });

                if (newlyDiscardedCount > 0) {
                    traversalPanel.decrementActiveCount(newlyDiscardedCount);
                }

                const drequest: DataEditsRequest = {
                    statName: "deny_listed",
                    floatValue: 0,
                    stringValue: '',
                    boolValue: true,
                    type: SampleEditType.EDIT_OVERRIDE,
                    samplesIds: sample_ids,
                    sampleOrigins: origins.length === sample_ids.length ? origins : sample_ids.map(_ => '')
                }
                try {
                    const dresponse = await dataClient.editDataSample(drequest).response;
                    if (!dresponse.success) {
                        console.error("Failed to discard:", dresponse.message);
                    }
                } catch (error) {
                    console.error("Error discarding:", error);
                }
                clearSelection();
                gridDataManager.debouncedFetchAndDisplay(() => gridDataManager.fetchAndDisplaySamples());
                break;

            case 'undiscard':
                await ensureTrainingPaused();

                let newlyRestoredCount = 0;
                // Update local tracking
                sample_ids.forEach(id => {
                    locallyDiscardedSampleIds.delete(id);
                    locallyRestoredSampleIds.add(id);
                });
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        // Check if currently discarded
                        const isDiscardedStat = record?.dataStats.find((s: any) => s.name === 'deny_listed');
                        // Check both value array and valueString for compatibility
                        const isCurrentlyDiscarded =
                            (isDiscardedStat?.value?.[0] === 1) ||
                            (isDiscardedStat?.valueString === '1' || isDiscardedStat?.valueString === 'true');

                        if (isCurrentlyDiscarded) {
                            newlyRestoredCount++;
                        }

                        // Update cell display immediately - mark as restored (deny_listed = 0)
                        gridCell.updateStats({ deny_listed: 0 });
                        const prefs = displayOptionsPanel?.getDisplayPreferences();
                        if (prefs) gridCell.updateDisplay(prefs);
                    }
                });

                if (newlyRestoredCount > 0) {
                    traversalPanel.incrementActiveCount(newlyRestoredCount);
                }

                const urequest: DataEditsRequest = {
                    statName: "deny_listed",
                    floatValue: 0,
                    stringValue: '',
                    boolValue: false,  // false to un-discard/restore
                    type: SampleEditType.EDIT_OVERRIDE,
                    samplesIds: sample_ids,
                    sampleOrigins: origins.length === sample_ids.length ? origins : sample_ids.map(_ => '')
                };
                try {
                    const uresponse = await dataClient.editDataSample(urequest).response;
                    if (!uresponse.success) {
                        console.error("Failed to restore:", uresponse.message);
                    }
                } catch (error) {
                    console.error("Error restoring:", error);
                }
                clearSelection();
                // Don't refetch - we already updated the cells directly above
                // debouncedFetchAndDisplay();
                break;
        }
    }
});

// =============================================================================
// Image Detail Modal
// =============================================================================

const imageDetailModal = document.getElementById('image-detail-modal') as HTMLElement;
const modalImage = document.getElementById('modal-image') as HTMLImageElement;
const modalStatsContainer = document.getElementById('modal-stats-container') as HTMLElement;
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;

// applySegmentationToModal and related functions now imported from helpers module

async function openImageDetailModal(cell: HTMLElement) {
    const gridCell = getGridCell(cell);
    if (!gridCell) return;

    const record = gridCell.getRecord();
    if (!record) return;

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
    sampleIdItem.title = `Sample ID: ${record.sampleId}`;
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
            const statItem = document.createElement('div');
            statItem.className = 'modal-stat-item';

            let value = '';
            let fullValue = '';

            // Handle string values
            if (stat.valueString !== undefined && stat.valueString !== '') {
                value = stat.valueString;
                fullValue = stat.valueString;
            }
            // Handle scalar values (in value array)
            else if (stat.value && stat.value.length > 0) {
                if (stat.value.length === 1) {
                    // Single scalar value
                    const num = stat.value[0];
                    if (typeof num === 'number' && Number.isNaN(num)) {
                        value = '';
                        fullValue = '';
                    } else {
                        const formatted = typeof num === 'number' && num % 1 !== 0
                            ? num.toFixed(4)
                            : String(num);
                        value = formatted;
                        fullValue = formatted;
                    }
                } else {
                    // Array of values - show first few, but keep full content for tooltip
                    const filtered = stat.value
                        .filter((v: number) => !(typeof v === 'number' && Number.isNaN(v)))
                        .map((v: number) => typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : String(v));
                    value = filtered.slice(0, 3).join(', ');
                    if (filtered.length > 3) {
                        value += '...';
                    }
                    fullValue = filtered.join(', ');
                }
            }
            else {
                value = '-';
                fullValue = '';
            }

            // Mask NaN or empty-like values
            if (value === '-' || value.trim() === '' || value.toLowerCase() === 'nan') {
                return; // skip rendering this stat
            }

            statItem.innerHTML = `
                <div class="modal-stat-label">${stat.name || 'Unknown'}</div>
                <div class="modal-stat-value">${value}</div>
            `;
            const tooltipValue = fullValue || value;
            statItem.title = `${stat.name || 'Unknown'}: ${tooltipValue}`;
            modalStatsContainer.appendChild(statItem);
        });
    }

    // Show the modal
    imageDetailModal.classList.add('visible');
    document.body.style.overflow = 'hidden';

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

        const highResResponse = await gridDataManager.externalFetchSamples!(highResRequest);

        if (highResResponse.success && highResResponse.dataRecords.length > 0) {
            const highResRecord = highResResponse.dataRecords[0];

            // Find raw_data stat - use full resolution for modal
            const rawImageStat = highResRecord.dataStats.find(
                (stat: any) => stat.name === 'raw_data' && stat.type === 'bytes'
            );

            if (rawImageStat && rawImageStat.value) {
                // Always use full resolution in modal (not thumbnail)
                const fullResBytes = new Uint8Array(rawImageStat.value);
                const base64Image = bytesToBase64(fullResBytes);

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

// closeImageDetailModal now imported from helpers module

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

// Add double-click event listener to grid cells
grid.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('.cell') as HTMLElement | null;

    if (cell) {
        openImageDetailModal(cell);
    }
});

// =============================================================================



if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeDarkMode();
        initializeUIElements();
        startTrainingStatusStream();
    });
} else {
    initializeDarkMode();
    initializeUIElements();
    startTrainingStatusStream();
}


// Helper functions for painter/tagging now imported from helpers module
// (setActiveBrush, updateUniqueTags, ensureTagMetadataEnabled)

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
        // Ensure training is paused before removing tags
        await ensureTrainingPaused();

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
                ensureTagMetadataEnabled();
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        const existingTagsStat = record?.dataStats.find((s: any) => s.name === 'tags');
                        const currentTagsStr = existingTagsStat?.valueString || "";
                        const newTagsStr = currentTagsStr.split(/[;,]/).map((t: string) => t.trim()).filter((t: string) => t && t !== tag).join('; ');
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

        // Ensure training is paused before tagging data
        await ensureTrainingPaused();

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
                ensureTagMetadataEnabled();
                if (!uniqueTags.includes(tag)) {
                    updateUniqueTags([...uniqueTags, tag].sort());
                }
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        const existingTagsStat = record?.dataStats.find((s: any) => s.name === 'tags');
                        const currentTagsStr = existingTagsStat?.valueString || "";
                        const currentTags = currentTagsStr.split(/[;,]/).map((t: string) => t.trim()).filter((t: string) => t);
                        if (!currentTags.includes(tag)) {
                            currentTags.push(tag);
                        }
                        const newTagsStr = currentTags.join('; ');
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
            // Ensure training is paused before clearing tags
            await ensureTrainingPaused();

            await removeTag(sampleIds, origins);
            ensureTagMetadataEnabled();
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

    // Add backdrop click handler to close modal
    const backdropClickHandler = (e: MouseEvent) => {
        if (e.target === modal || (e.target as HTMLElement).classList.contains('modal-backdrop')) {
            cleanup();
            modal?.removeEventListener('click', backdropClickHandler);
        }
    };
    modal?.addEventListener('click', backdropClickHandler);
}

// removeTag function - requires dataClient for API calls
async function removeTag(sampleIds: number[], origins: string[]) {
    // Ensure training is paused before removing tags
    await ensureTrainingPaused();

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
            ensureTagMetadataEnabled();
            selectedCells.forEach(cell => {
                const gridCell = getGridCell(cell);
                if (gridCell) {
                    gridCell.updateStats({ "tags": "" });
                }
            });
            gridDataManager.clearResponseCache();
        } else {
            alert(`Failed to remove tag: ${response.message}`);
        }
    } catch (error) {
        alert(`Error removing tag: ${error}`);
    }
}

async function paintCell(cell: HTMLElement) {
    // Ensure training is paused before restoring data (painter mode)
    await ensureTrainingPaused();

    const activeBrushTags = leftPanel.getActiveBrushTags();
    if (activeBrushTags.size === 0) return;

    const gridCell = getGridCell(cell);
    if (!gridCell) return;

    const record = gridCell.getRecord();
    if (!record) return;

    // Check current tags
    const tagsStat = record.dataStats.find((s: any) => s.name === 'tags');
    const currentTagsStr = tagsStat?.valueString || "";
    // Filter out None, empty strings, and whitespace-only strings
    // Backend uses semi-colon separator
    const currentTags = Array.from(new Set(currentTagsStr
        .split(/[;,]/)
        .map((t: string) => t.trim())
        .filter((t: any) => t && t !== 'None')));

    if (leftPanel.getPainterRemoveMode()) {
        // REMOVE MODE: Remove any selected tags that exist
        const tagsToRemove = Array.from(activeBrushTags).filter((t: string) => currentTags.includes(t));
        if (tagsToRemove.length === 0) return;

        const newTags = (currentTags as string[]).filter((t: string) => !tagsToRemove.includes(t));
        const newTagsStr = newTags.join(';');

        // Optimistic update
        gridCell.updateStats({ "tags": newTagsStr });

        ensureTagMetadataEnabled();


        // Send remove requests
        tagsToRemove.forEach((tag: string) => {
            const request: DataEditsRequest = {
                statName: "tags",
                floatValue: 0,
                stringValue: tag,
                boolValue: false,
                type: SampleEditType.EDIT_REMOVE,
                samplesIds: [record.sampleId],
                sampleOrigins: [getRecordOrigin(record)]
            };

            dataClient.editDataSample(request).response.then((r: any) => {
                if (!r.success) {
                    console.error(`Remove failed for tag ${tag}:`, r.message);
                }
            });
        });
    } else {
        // ADD MODE: Add selected tags that don't exist
        const tagsToAdd = Array.from(activeBrushTags).filter((t: string) => !currentTags.includes(t));
        if (tagsToAdd.length === 0) return;

        // Deduplicate using Set to be safe
        const newTags = Array.from(new Set([...currentTags, ...tagsToAdd])).filter(Boolean);
        const newTagsStr = newTags.join(';');

        // Optimistic update
        gridCell.updateStats({ "tags": newTagsStr });

        ensureTagMetadataEnabled();


        // Send add requests
        tagsToAdd.forEach((tag: string) => {
            const request: DataEditsRequest = {
                statName: "tags",
                floatValue: 0,
                stringValue: tag,
                boolValue: false,
                type: SampleEditType.EDIT_ACCUMULATE,
                samplesIds: [record.sampleId],
                sampleOrigins: [getRecordOrigin(record)]
            };

            dataClient.editDataSample(request).response.then((r: any) => {
                if (!r.success) {
                    console.error(`Paint failed for tag ${tag}:`, r.message);
                }
            });
        });
    }
}

// Window function assignments for checkpoint restore now handled by plotsManager module
