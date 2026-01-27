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
    AgentIntentType,
} from "./experiment_service";
import { DataDisplayOptionsPanel, SplitColors } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { GridManager } from "./GridManager";
import { initializeDarkMode } from "./darkMode";
import Chart from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";

// Utility function to convert bytes to base64
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
import { ClassPreference, GridCell } from "./GridCell";
import { SegmentationRenderer } from "./SegmentationRenderer";


const SERVER_URL = "http://localhost:8080";

const transport = new GrpcWebFetchTransport(
    { baseUrl: SERVER_URL, format: "text", });

const dataClient = new ExperimentServiceClient(transport);
const traversalPanel = new DataTraversalAndInteractionsPanel();

// Grid settings persistence helpers
function saveGridSettings(): void {
    const cellSizeInput = document.getElementById('cell-size') as HTMLInputElement;
    const zoomLevelInput = document.getElementById('zoom-level') as HTMLInputElement;
    const imageResolutionAutoInput = document.getElementById('image-resolution-auto') as HTMLInputElement;
    const imageResolutionPercentInput = document.getElementById('image-resolution-percent') as HTMLInputElement;

    if (cellSizeInput) localStorage.setItem('grid-cell-size', cellSizeInput.value);
    if (zoomLevelInput) localStorage.setItem('grid-zoom-level', zoomLevelInput.value);
    if (imageResolutionAutoInput) localStorage.setItem('grid-image-resolution-auto', imageResolutionAutoInput.checked.toString());
    if (imageResolutionPercentInput) localStorage.setItem('grid-image-resolution-percent', imageResolutionPercentInput.value);
}

function restoreGridSettings(): void {
    const cellSizeInput = document.getElementById('cell-size') as HTMLInputElement;
    const cellSizeValue = document.getElementById('cell-size-value') as HTMLElement;
    const zoomLevelInput = document.getElementById('zoom-level') as HTMLInputElement;
    const zoomValue = document.getElementById('zoom-value') as HTMLElement;
    const imageResolutionAutoInput = document.getElementById('image-resolution-auto') as HTMLInputElement;
    const imageResolutionPercentInput = document.getElementById('image-resolution-percent') as HTMLInputElement;
    const imageResolutionValue = document.getElementById('image-resolution-value') as HTMLSpanElement;

    // Use cached values from window object if available (set by HTML script), otherwise use localStorage
    const cachedSettings = (window ).__cachedGridSettings || {};
    const savedCellSize = cachedSettings.cellSize || localStorage.getItem('grid-cell-size');
    const savedZoomLevel = cachedSettings.zoomLevel || localStorage.getItem('grid-zoom-level');
    const savedImageResolutionAuto = cachedSettings.imageResolutionAuto || localStorage.getItem('grid-image-resolution-auto');
    const savedImageResolutionPercent = cachedSettings.imageResolutionPercent || localStorage.getItem('grid-image-resolution-percent');

    if (savedCellSize && cellSizeInput) {
        cellSizeInput.value = savedCellSize;
        if (cellSizeValue) cellSizeValue.textContent = savedCellSize;
    }

    if (savedZoomLevel && zoomLevelInput) {
        zoomLevelInput.value = savedZoomLevel;
        if (zoomValue) zoomValue.textContent = `${savedZoomLevel}%`;
    }

    if (savedImageResolutionAuto && imageResolutionAutoInput) {
        imageResolutionAutoInput.checked = savedImageResolutionAuto === 'true';
    }

    if (savedImageResolutionPercent && imageResolutionPercentInput) {
        imageResolutionPercentInput.value = savedImageResolutionPercent;
        if (imageResolutionValue) imageResolutionValue.textContent = `${savedImageResolutionPercent}%`;
    }
}

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
let connectionStatusElement: HTMLElement | null = null;
let uniqueTags: string[] = [];
let signalsContainer: HTMLElement | null = null;

type SignalPoint = { x: number; y: number };
type SignalRawPoint = { x: number; y: number; experimentHash?: string; changeDetail?: string };

interface SignalChart {
    chart: Chart;
    data: SignalPoint[]; // plotted (smoothed/decimated) points
    rawPoints: SignalRawPoint[]; // full history kept in memory (bounded)
    pending: boolean;
    color: string;
    smoothingEnabled: boolean;
    smoothingFactor: number;
    stdEnabled: boolean;
    userZoomed: boolean;
}

const signalCharts = new Map<string, SignalChart>();
const SIGNAL_UPDATE_INTERVAL_MS = 5000;
const SIGNAL_MAX_POINTS = 5000;
let signalUpdateTimer: number | null = null;

// Double-click detection for markers
let lastMarkerClickTime: number = 0;
const DOUBLE_CLICK_THRESHOLD_MS = 1000;

// Available data splits reported by backend (train/eval/test/custom)
let availableSplits: string[] = ['train', 'eval'];

let fetchTimeout: any = null;
let currentFetchRequestId = 0;
let datasetInfoReady = false;

// Painter Mode State
let isPainterMode = false;
let isPainterRemoveMode = false;
let activeBrushTags = new Set<string>();

// Training metrics for display: map of metricName -> { value, timestamp }
const latestMetrics = new Map<string, { value: number; timestamp: number }>();

// Plot/history tuning
const SIGNAL_HISTORY_LIMIT = 50000; // keep up to 50k raw points per signal
const PLOT_STRIDE = 5; // plot every Nth point to reduce clutter
const SMOOTHING_FACTOR = 0.6; // exponential smoothing (TensorBoard-like)
const STD_WINDOW = 20; // window size for std band (in decimated points)

const MINUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const PLUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;


// Prefetch Cache for faster navigation
interface CacheEntry {
    response: DataSamplesResponse;
    timestamp: number;
}
const responseCache = new Map<string, CacheEntry>();
const MAX_PREFETCH_BATCHES = (() => {
    const envValue = import.meta.env.VITE_MAX_PREFETCH_BATCHES;
    const parsed = parseInt(envValue, 10);
    // Validate: must be a positive integer, otherwise default to 5
    return (Number.isInteger(parsed) && parsed > 0) ? parsed : 5;
})();
const MAX_CACHE_ENTRIES = MAX_PREFETCH_BATCHES + 4; // Keep extra batches in memory (+2 for first/last batches)
let prefetchInProgress = false;
let lastFetchedBatchStart: number = 0; // Track navigation direction
// function applyLocalOverrides(record: any) { ... } // Removed



// Track discarded sample IDs locally to persist state across refreshes
const locallyDiscardedSampleIds = new Set<number>();

function getCacheKey(startIndex: number, count: number, resizeWidth: number, resizeHeight: number): string {
    return `${startIndex}-${count}-${resizeWidth}-${resizeHeight}`;
}

function getCachedResponse(startIndex: number, count: number, resizeWidth: number, resizeHeight: number): DataSamplesResponse | null {
    const key = getCacheKey(startIndex, count, resizeWidth, resizeHeight);
    const entry = responseCache.get(key);
    if (entry) {
        console.debug(`[Cache HIT] Using cached response for startIndex=${startIndex}`);
        return entry.response;
    }
    console.debug(`[Cache MISS] No cached response for startIndex=${startIndex}`);
    return null;
}

function setCachedResponse(startIndex: number, count: number, resizeWidth: number, resizeHeight: number, response: DataSamplesResponse): void {
    const key = getCacheKey(startIndex, count, resizeWidth, resizeHeight);
    responseCache.set(key, { response, timestamp: Date.now() });

    // LRU eviction: keep only MAX_CACHE_ENTRIES most recent
    // BUT protect first batch (startIndex=0) and last batch from eviction
    if (responseCache.size > MAX_CACHE_ENTRIES) {
        const maxSampleId = traversalPanel.getMaxSampleId();
        const lastBatchStart = Math.floor(maxSampleId / count) * count;

        const sortedEntries = Array.from(responseCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Find first evictable entry (not first or last batch)
        for (const [oldestKey, _] of sortedEntries) {
            const keyParts = oldestKey.split('-');
            const keyStartIndex = parseInt(keyParts[0]);

            // Skip if this is the first batch (0) or last batch
            if (keyStartIndex === 0 || keyStartIndex === lastBatchStart) {
                continue;
            }

            // Evict this entry
            responseCache.delete(oldestKey);
            console.debug(`[Cache EVICT] Removed entry: ${oldestKey} (protected first and last batches)`);
            break;
        }
    }
}

function clearResponseCache(): void {
    responseCache.clear();
    console.debug('[Cache CLEAR] All cached responses cleared');
}

// Register zoom plugin
Chart.register(zoomPlugin);

// --- Signal charts (streamed training signals) ---
let signalsBoardHeaderInitialized = false;

function initSignalsBoard(): void {
    signalsContainer = document.getElementById('signals-board') as HTMLElement | null;

    // Add header with global plot settings button if not already added
    if (signalsContainer && !signalsBoardHeaderInitialized) {

        const title = document.createElement('div');
        title.textContent = 'Training Signals';
        title.style.fontWeight = '600';
        title.style.fontSize = '14px';

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️ Plot Settings';
        settingsBtn.title = 'Configure plot refresh interval and other settings';
        settingsBtn.style.padding = '6px 12px';
        settingsBtn.style.backgroundColor = 'var(--accent-color, #007aff)';
        settingsBtn.style.color = '#fff';
        settingsBtn.style.border = 'none';
        settingsBtn.style.borderRadius = '4px';
        settingsBtn.style.cursor = 'pointer';
        settingsBtn.style.fontSize = '12px';
        settingsBtn.onclick = openGlobalPlotSettings;
        // Insert header as first child of signals-board
        signalsBoardHeaderInitialized = true;
    }
}

function ensureSignalsContainer(): HTMLElement | null {
    if (signalsContainer) return signalsContainer;
    signalsContainer = document.getElementById('signals-board');
    return signalsContainer;
}

function readCssVar(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
}

function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return hex;
    const num = parseInt(normalized, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function triangleColor(): string {
    return isDarkMode() ? '#ffffff' : '#000000';
}

/**
 * Show tooltip with marker hash on hover.
 */
function showMarkerTooltip(marker: { experimentHash?: string; x?: number; y?: number }, event: MouseEvent): void {
    console.debug('showMarkerTooltip called for hash:', marker?.experimentHash);
    let tooltip = document.getElementById('marker-tooltip') as HTMLElement;
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'marker-tooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.backgroundColor = '#333';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.zIndex = '99999';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.maxWidth = '300px';
        tooltip.style.wordBreak = 'break-all';
        tooltip.style.whiteSpace = 'pre-line';
        document.body.appendChild(tooltip);
    }
    const hash = marker?.experimentHash ?? 'unknown';
    tooltip.textContent = `Hash: ${hash}\nDouble click to restore state`;
    tooltip.style.left = (event.clientX + 10) + 'px';
    tooltip.style.top = (event.clientY + 10) + 'px';
    tooltip.style.display = 'block';
    console.debug('Tooltip displayed at', tooltip.style.left, tooltip.style.top);
}

/**
 * Hide marker tooltip.
 */
function hideMarkerTooltip(): void {
    const tooltip = document.getElementById('marker-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Show modal for restoring a checkpoint from marker.
 */
function showRestoreMarkerModal(marker: any, signalName: string): void {
    let modal = document.getElementById('restore-marker-modal') as HTMLElement;
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'restore-marker-modal';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.backgroundColor = '#fff';
        modal.style.border = '1px solid #ccc';
        modal.style.borderRadius = '8px';
        modal.style.padding = '20px';
        modal.style.zIndex = '10001';
        modal.style.minWidth = '400px';
        modal.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        modal.style.maxHeight = '80vh';
        modal.style.overflowY = 'auto';
        modal.style.color = '#000';
        document.body.appendChild(modal);

        // Add overlay
        const overlay = document.createElement('div');
        overlay.id = 'restore-marker-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '10000';
        overlay.onclick = closeRestoreMarkerModal;
        document.body.appendChild(overlay);
    }

    // Populate modal content
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 style="margin: 0;">Restore Checkpoint</h2>
            <button onclick="(window ).closeRestoreMarkerModal()" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-weight: bold;">Signal:</label>
            <div>${signalName}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-weight: bold;">Experiment Hash:</label>
            <div style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 8px; border-radius: 4px;">${marker.experimentHash}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-weight: bold;">Model Age (Steps):</label>
            <div>${marker.x}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-weight: bold;">Value:</label>
            <div>${marker.y.toFixed(4)}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-weight: bold;">Details:</label>
            <div>${marker.changeDetail ? marker.changeDetail : 'No change details available'}</div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button onclick="(window ).executeRestoreCheckpoint('${marker.experimentHash}')" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Restore Checkpoint</button>
        </div>
    `;

    modal.style.display = 'block';
    document.getElementById('restore-marker-overlay')!.style.display = 'block';
}

/**
 * Close restore marker modal.
 */
function closeRestoreMarkerModal(): void {
    const modal = document.getElementById('restore-marker-modal');
    const overlay = document.getElementById('restore-marker-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

/**
 * Execute checkpoint restore with UI freeze and status monitoring.
 */
async function executeRestoreCheckpoint(experimentHash: string): Promise<void> {
    console.log(`🔄 Restoring checkpoint: ${experimentHash}`);

    closeRestoreMarkerModal();
    // Pause training before applying a checkpoint restore to avoid concurrent updates
    await ensureTrainingPaused();
    freezeUIForRestore();

    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    try {
        // Call backend to restore checkpoint
        const resp = await dataClient.restoreCheckpoint({
            experimentHash
        }).response;

        if (resp.success) {
            console.log(`✅ Checkpoint restored successfully`);

            // Reload metadata and cached data
            clearResponseCache();
            await refreshDynamicStatsOnly();

            unfreezeUIAfterRestore();
        } else {
            console.error(`❌ Restore failed: ${resp.message}`);
            unfreezeUIAfterRestore();
        }
    } catch (err) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
            console.warn(`⏱️ Restore timed out after ${timeout}ms`);
        } else {
            console.error(`❌ Restore error: ${err}`);
        }
        unfreezeUIAfterRestore();
    }
}

/**
 * Freeze UI during checkpoint restore.
 */
function freezeUIForRestore(): void {
    const elements = [
        document.getElementById('cells-grid'),
        document.getElementById('chat-input-container'),
        document.querySelector('.inspector-container'),
        document.querySelector('.training-card'),
        document.querySelector('.tagger-card'),
        document.querySelector('.signals-board'),
    ];

    elements.forEach((el) => {
        if (el) {
            (el as any).__freezeOverlay = document.createElement('div');
            const overlay = (el as any).__freezeOverlay;
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
            overlay.style.zIndex = '9999';
            overlay.style.cursor = 'not-allowed';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.color = 'white';
            overlay.style.fontSize = '16px';
            overlay.innerHTML = '🔄 Restoring checkpoint... Please wait';

            el.style.position = 'relative';
            el.style.opacity = '0.5';
            el.style.pointerEvents = 'none';
            el.appendChild(overlay);
        }
    });

    document.body.style.cursor = 'not-allowed';
}

/**
 * Unfreeze UI after checkpoint restore.
 */
function unfreezeUIAfterRestore(): void {
    const elements = [
        document.getElementById('cells-grid'),
        document.getElementById('chat-input-container'),
        document.querySelector('.inspector-container'),
        document.querySelector('.training-card'),
        document.querySelector('.tagger-card'),
        document.querySelector('.signals-board'),
    ];

    elements.forEach((el) => {
        if (el) {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'auto';

            if ((el as any).__freezeOverlay) {
                (el as any).__freezeOverlay.remove();
                (el as any).__freezeOverlay = null;
            }
        }
    });

    document.body.style.cursor = 'auto';
}

/**
 * Highlight the line segment corresponding to a marker on hover.
 * The segment spans from this marker to the next marker (or end of curve).
 */
function highlightSegmentFromMarker(chart: Chart, markerIndex: number, baseColor: string): void {
    const markersDataset = chart.data.datasets[3];
    const markers = markersDataset.data as any[];

    if (markerIndex >= markers.length) return;

    // Store highlight state on chart
    (chart as any).__highlightedSegment = markerIndex;
    console.debug('Highlighting segment:', markerIndex);
    chart.draw();
}

/**
 * Clear segment highlighting.
 */
function clearSegmentHighlight(chart: Chart): void {
    (chart as any).__highlightedSegment = null;
    console.debug('clearSegmentHighlight');
    chart.draw();
}

function applyStride(points: SignalRawPoint[], stride: number): SignalRawPoint[] {
    // For small series, skip decimation to avoid dropping all but the first point
    if (stride <= 1 || points.length <= stride) return points;
    const out: SignalRawPoint[] = [];
    for (let i = 0; i < points.length; i++) {
        if (i % stride === 0) {
            out.push(points[i]);
        }
    }
    return out;
}

/**
 * Describe what changed between two experiment hashes.
 * Hash structure: [HP: 8 chars][MODEL: 8 chars][DATA: 8 chars]
 */
function describeHashChange(prevHash: string, currHash: string): string | undefined {
    if (!prevHash || !currHash || prevHash.length < 24 || currHash.length < 24) {
        return undefined;
    }

    // Extract components: first 8 chars = HP, next 8 = MODEL, last 8 = DATA
    const prevHP = prevHash.slice(0, 8);
    const prevModel = prevHash.slice(8, 16);
    const prevData = prevHash.slice(16, 24);

    const currHP = currHash.slice(0, 8);
    const currModel = currHash.slice(8, 16);
    const currData = currHash.slice(16, 24);

    const changes: string[] = [];

    if (prevHP !== currHP) {
        changes.push(`HP (changed): ${prevHP} → ${currHP}`);
    } else {
        changes.push(`HP: ${prevHP} (unchanged)`);
    }

    if (prevModel !== currModel) {
        changes.push(`MODEL (changed): ${prevModel} → ${currModel}`);
    } else {
        changes.push(`MODEL: ${prevModel} (unchanged)`);
    }

    if (prevData !== currData) {
        changes.push(`DATA (changed): ${prevData} → ${currData}`);
    } else {
        changes.push(`DATA: ${prevData} (unchanged)`);
    }

    return changes.join('\n');
}

function buildSmoothedSeries(points: SignalRawPoint[], opts: {
    smoothingEnabled: boolean;
    smoothingFactor: number;
    stdEnabled: boolean;
}): {
    smoothed: SignalPoint[];
    upper: SignalPoint[];
    lower: SignalPoint[];
    markers: SignalRawPoint[];
} {
    const smoothed: SignalPoint[] = [];
    const upper: SignalPoint[] = [];
    const lower: SignalPoint[] = [];
    const markers: SignalRawPoint[] = [];

    const decimated = applyStride(points, PLOT_STRIDE);
    if (decimated.length === 0) {
        return { smoothed, upper, lower, markers };
    }

    let ema = decimated[0].y;
    const window: number[] = [];
    let previousHash: string | undefined;
    for (let i = 0; i < decimated.length; i++) {
        const p = decimated[i];
        const factor = opts.smoothingEnabled ? opts.smoothingFactor : 0;
        ema = i === 0 ? p.y : (factor * ema + (1 - factor) * p.y);

        window.push(p.y);
        if (window.length > STD_WINDOW) window.shift();
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
        const std = Math.sqrt(variance);

        smoothed.push({ x: p.x, y: ema });
        if (opts.stdEnabled) {
            upper.push({ x: p.x, y: ema + std });
            lower.push({ x: p.x, y: ema - std });
        }

        if (p.experimentHash && (i === 0 || p.experimentHash !== decimated[i - 1].experimentHash)) {
            const changeDetail = previousHash ? describeHashChange(previousHash, p.experimentHash) : undefined;
            markers.push({ x: p.x, y: ema, experimentHash: p.experimentHash, changeDetail });
            previousHash = p.experimentHash;
        } else if (p.experimentHash) {
            previousHash = p.experimentHash;
        }
    }

    return { smoothed, upper, lower, markers };
}

function startSignalUpdateLoop(): void {
    if (signalUpdateTimer !== null) return;
    signalUpdateTimer = window.setInterval(() => {
        signalCharts.forEach((entry) => {
            if (entry.pending) {
                entry.chart.update('none');
                entry.pending = false;
            }
        });
    }, SIGNAL_UPDATE_INTERVAL_MS);
}

function getOrCreateSignalChart(signalName: string): SignalChart | null {
    const existing = signalCharts.get(signalName);
    if (existing) return existing;

    const container = ensureSignalsContainer();
    if (!container) {
        console.warn('Signals container not found in DOM.');
        return null;
    }

    const accent = readCssVar('--accent-color', '#007aff');
    const accentSoft = readCssVar('--accent-soft', 'rgba(0, 122, 255, 0.15)');
    const gridColor = readCssVar('--border-subtle', 'rgba(0, 0, 0, 0.12)');

    const card = document.createElement('div');
    card.className = 'signal-card';

    const header = document.createElement('div');
    header.className = 'signal-card-header';

    const title = document.createElement('div');
    title.className = 'signal-card-title';
    title.textContent = signalName;

    const subtitle = document.createElement('div');
    subtitle.className = 'signal-card-subtitle';
    subtitle.textContent = '';

    const controls = document.createElement('div');
    controls.className = 'signal-card-controls';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'signal-btn-small';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset zoom';

    const csvBtn = document.createElement('button');
    csvBtn.className = 'signal-btn-small';
    csvBtn.textContent = 'CSV';
    csvBtn.title = 'Export as CSV';

    const jsonBtn = document.createElement('button');
    jsonBtn.className = 'signal-btn-small';
    jsonBtn.textContent = 'JSON';
    jsonBtn.title = 'Export as JSON';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'signal-btn-small';
    settingsBtn.textContent = 'Settings';
    settingsBtn.title = 'Plot settings';

    const savedColor = localStorage.getItem(`signal-color-${signalName}`) || '#ffffff';

    controls.appendChild(resetBtn);
    controls.appendChild(csvBtn);
    controls.appendChild(jsonBtn);
    controls.appendChild(settingsBtn);

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(controls);

    const canvas = document.createElement('canvas');
    // Set fixed size for canvas to prevent sync with other charts
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.position = 'relative';
    canvasWrapper.style.width = '100%';
    canvasWrapper.style.height = 'auto';
    canvasWrapper.style.minHeight = '300px';
    canvasWrapper.appendChild(canvas);

    card.appendChild(header);
    card.appendChild(canvasWrapper);
    container.appendChild(card);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Unable to initialize chart canvas for signal', signalName);
        return null;
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'std-lower',
                    data: [],
                    borderColor: 'rgba(0,0,0,0)',
                    backgroundColor: 'rgba(0,0,0,0)',
                    pointRadius: 0,
                    borderWidth: 0,
                    tension: 0,
                    fill: false,
                },
                {
                    label: 'std-upper',
                    data: [],
                    borderColor: 'rgba(0,0,0,0)',
                    backgroundColor: hexToRgba(savedColor, 0.15),
                    pointRadius: 0,
                    borderWidth: 0,
                    tension: 0,
                    fill: '-1',
                },
                {
                    label: signalName,
                    data: [],
                    borderColor: savedColor,
                    backgroundColor: hexToRgba(savedColor, 0),
                    pointRadius: 0,
                    pointHitRadius: 6,
                    borderWidth: 2,
                    tension: 0,
                },
                {
                    label: 'markers',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: '#ff6b6b',
                    pointStyle: 'star',
                    pointRadius: 12,
                    pointHoverRadius: 14,
                    borderWidth: 1,
                    showLine: false,
                },
            ],
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            parsing: false,
            animation: false,
            normalized: true,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'nearest',
                    intersect: false,
                },
                decimation: { enabled: true, algorithm: 'lttb', samples: 300 },
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 },
                        pinch: { enabled: true },
                        mode: 'xy',
                        onZoomComplete: () => { entry.userZoomed = true; },
                    },
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        // allow click-drag panning without modifier key
                        onPanComplete: () => { entry.userZoomed = true; },
                    },
                },
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: false },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 10,
                        callback: (value) => Number(value).toFixed(0),
                    },
                    grid: { color: gridColor },
                },
                y: {
                    type: 'linear',
                    title: { display: false },
                    grid: { color: gridColor },
                    grace: '5%',
                    min: 0,
                },
            },
            onHover: (event: any, activeElements: any) => {
                // Only handle hover for markers (dataset 3)
                if (activeElements && activeElements.length > 0) {
                    // Check if any element is a marker (dataset 3)
                    const markerElement = activeElements.find((el: any) => el.datasetIndex === 3);

                    if (markerElement) {
                        // Hovering over a marker - highlight the segment
                        const markerIndex = markerElement.index;
                        const markersDataset = chart.data.datasets[3];
                        const markers = markersDataset.data as any[];
                        const marker = markers[markerIndex];

                        console.debug('Highlighting marker', markerIndex, 'of', markers.length, 'markers');
                        highlightSegmentFromMarker(chart, markerIndex, entry.color);

                        // Show marker details in tooltip
                        if (marker) {
                            showMarkerTooltip(marker, event.native);
                        }

                        // Store marker info for click handling
                        (chart as any).__hoveredMarker = { markerIndex, marker, signalName };
                    } else {
                        // Not hovering over a marker - clear everything
                        clearSegmentHighlight(chart);
                        hideMarkerTooltip();
                        (chart as any).__hoveredMarker = null;
                    }
                } else {
                    // Mouse left the chart - clear highlight
                    clearSegmentHighlight(chart);
                    hideMarkerTooltip();
                    (chart as any).__hoveredMarker = null;
                }
            },
            onClick: (event: any, activeElements: any) => {
                // Detect double-click for restore modal (only on markers)
                if (!activeElements || activeElements.length === 0) return;

                // Check if clicked element is a marker (dataset 3)
                const markerElement = activeElements.find((el: any) => el.datasetIndex === 3);
                if (!markerElement) return;

                const now = Date.now();
                const isDoubleClick = now - lastMarkerClickTime < DOUBLE_CLICK_THRESHOLD_MS;
                console.debug(`Marker click: elapsed=${now - lastMarkerClickTime}ms, isDouble=${isDoubleClick}`);
                lastMarkerClickTime = now;

                if (!isDoubleClick) return;

                const hoveredMarker = (chart as any).__hoveredMarker;
                console.debug('Opening restore modal for:', hoveredMarker?.marker?.experimentHash);
                if (hoveredMarker && hoveredMarker.marker) {
                    showRestoreMarkerModal(hoveredMarker.marker, signalName);
                    lastMarkerClickTime = 0; // Reset after modal opens
                }
            },
        },
        plugins: [
            {
                id: 'segmentHighlight',
                afterDatasetsDraw(chart: Chart) {
                    const ctx = chart.ctx;
                    const highlightedSegment = (chart as any).__highlightedSegment;

                    if (highlightedSegment === null || highlightedSegment === undefined) return;

                    const lowerDataset = chart.data.datasets[0];
                    const upperDataset = chart.data.datasets[1];
                    const mainLineDataset = chart.data.datasets[2];
                    const markersDataset = chart.data.datasets[3];
                    const markers = markersDataset.data as any[];

                    if (highlightedSegment >= markers.length) return;

                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;

                    const currentMarker = markers[highlightedSegment];
                    const nextMarker = highlightedSegment + 1 < markers.length ? markers[highlightedSegment + 1] : null;

                    const currentX = currentMarker.x;
                    const nextX = nextMarker?.x ?? Infinity;

                    const mainLinePoints = mainLineDataset.data as any[];
                    const lowerPoints = lowerDataset.data as any[];
                    const upperPoints = upperDataset.data as any[];

                    // Find points in the segment
                    // Markers themselves are points, so include them in the segment
                    // Combine main line points with marker points for complete segment
                    let segmentPoints: any[];
                    let segmentLower: any[];
                    let segmentUpper: any[];

                    if (nextMarker) {
                        // Include points from current marker up to (and including) next marker
                        // Markers are data points themselves
                        const linePoints = mainLinePoints.filter((p: any) => p.x >= currentX && p.x <= nextX);
                        const markerPoints = markers.filter((m: any) => m.x >= currentX && m.x <= nextX);
                        segmentPoints = [...linePoints, ...markerPoints].sort((a, b) => a.x - b.x);

                        segmentLower = lowerPoints.filter((p: any) => p.x >= currentX && p.x <= nextX);
                        segmentUpper = upperPoints.filter((p: any) => p.x >= currentX && p.x <= nextX);
                    } else {
                        // Last segment: include all points from current marker to end
                        const linePoints = mainLinePoints.filter((p: any) => p.x >= currentX);
                        const markerPoints = markers.filter((m: any) => m.x >= currentX);
                        segmentPoints = [...linePoints, ...markerPoints].sort((a, b) => a.x - b.x);

                        segmentLower = lowerPoints.filter((p: any) => p.x >= currentX);
                        segmentUpper = upperPoints.filter((p: any) => p.x >= currentX);
                    }

                    ctx.save();

                    // Draw highlighted std band if available (need at least 2 points for upper and lower)
                    if (segmentLower.length >= 2 && segmentUpper.length >= 2) {
                        ctx.fillStyle = 'rgba(52, 152, 219, 0.25)';
                        ctx.beginPath();

                        // Draw upper bound
                        for (let i = 0; i < segmentUpper.length; i++) {
                            const p = segmentUpper[i];
                            const xPixel = xScale.getPixelForValue(p.x);
                            const yPixel = yScale.getPixelForValue(p.y);
                            if (i === 0) {
                                ctx.moveTo(xPixel, yPixel);
                            } else {
                                ctx.lineTo(xPixel, yPixel);
                            }
                        }

                        // Draw lower bound in reverse
                        for (let i = segmentLower.length - 1; i >= 0; i--) {
                            const p = segmentLower[i];
                            const xPixel = xScale.getPixelForValue(p.x);
                            const yPixel = yScale.getPixelForValue(p.y);
                            ctx.lineTo(xPixel, yPixel);
                        }

                        ctx.closePath();
                        ctx.fill();
                    }

                    // Draw highlighted main line
                    ctx.strokeStyle = '#3498db';
                    ctx.lineWidth = 4;
                    ctx.globalAlpha = 0.8;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    ctx.beginPath();

                    if (segmentPoints.length >= 2) {
                        // Draw line through all points in segment
                        for (let i = 0; i < segmentPoints.length; i++) {
                            const p = segmentPoints[i];
                            const xPixel = xScale.getPixelForValue(p.x);
                            const yPixel = yScale.getPixelForValue(p.y);

                            if (i === 0) {
                                ctx.moveTo(xPixel, yPixel);
                            } else {
                                ctx.lineTo(xPixel, yPixel);
                            }
                        }
                        ctx.stroke();
                    } else if (segmentPoints.length === 1 && nextMarker) {
                        // Only start point exists - draw to next marker position
                        const p = segmentPoints[0];
                        const xPixel = xScale.getPixelForValue(p.x);
                        const yPixel = yScale.getPixelForValue(p.y);
                        ctx.moveTo(xPixel, yPixel);

                        const nextXPixel = xScale.getPixelForValue(nextMarker.x);
                        const nextYPixel = yScale.getPixelForValue(nextMarker.y);
                        ctx.lineTo(nextXPixel, nextYPixel);
                        ctx.stroke();
                    }

                    ctx.restore();
                },
            },
        ],
    } as any);

    resetBtn.onclick = () => {
        (chart as any).resetZoom();
    };

    csvBtn.onclick = () => {
        exportSignalDataCSV(signalName, entry.rawPoints.length ? entry.rawPoints : entry.data);
    };

    jsonBtn.onclick = () => {
        exportSignalDataJSON(signalName, entry.rawPoints.length ? entry.rawPoints : entry.data);
    };

    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        openSignalSettings(signalName);
    };

    const entry: SignalChart = {
        chart,
        data: [],
        rawPoints: [],
        pending: false,
        color: savedColor,
        smoothingEnabled: true,
        smoothingFactor: SMOOTHING_FACTOR,
        stdEnabled: true,
        userZoomed: false,
    };

    // Store original line color for segment highlighting
    (chart as any).__originalLineColor = savedColor;

    signalCharts.set(signalName, entry);
    startSignalUpdateLoop();
    return entry;
}

function pushSignalSample(signalName: string, modelAge: number, value: number): void {
    if (!Number.isFinite(modelAge) || !Number.isFinite(value)) return;
    const entry = getOrCreateSignalChart(signalName);
    if (!entry) return;

    entry.rawPoints.push({ x: modelAge, y: value });
    if (entry.rawPoints.length > SIGNAL_HISTORY_LIMIT) {
        entry.rawPoints.splice(0, entry.rawPoints.length - SIGNAL_HISTORY_LIMIT);
    }

    refreshSignalChart(entry, signalName);
}

function refreshSignalChart(entry: SignalChart, signalName: string, graphName?: string): void {
    const { smoothed, upper, lower, markers } = buildSmoothedSeries(entry.rawPoints, {
        smoothingEnabled: entry.smoothingEnabled,
        smoothingFactor: entry.smoothingFactor,
        stdEnabled: entry.stdEnabled,
    });

    entry.data = smoothed;

    const chart = entry.chart;
    const datasets = chart.data.datasets;

    // Std band between lower (0) and upper (1)
    datasets[0].data = entry.stdEnabled ? lower : [];
    datasets[1].data = entry.stdEnabled ? upper : [];
    datasets[1].backgroundColor = entry.stdEnabled ? hexToRgba(entry.color, 0.15) : 'rgba(0,0,0,0)';

    // Main line (2)
    datasets[2].data = smoothed;
    datasets[2].pointRadius = 0;
    datasets[2].borderColor = entry.color;
    datasets[2].backgroundColor = hexToRgba(entry.color, 0);

    // Triangles (3)
    datasets[3].data = markers;
    datasets[3].backgroundColor = '#ff6b6b';

    if (markers.length > 0) {
        console.debug(`📍 ${signalName}: ${markers.length} markers, first at x=${markers[0].x}, last at x=${markers[markers.length - 1].x}`);
    }

    chart.options.plugins.tooltip = {
        filter: (item) => item.datasetIndex !== 0 && item.datasetIndex !== 1 && item.datasetIndex !== 3,
        callbacks: {
            label: function(context) {
                if (context.datasetIndex === 3) {
                    const marker = (chart.data.datasets[3].data as any)[context.dataIndex];
                    const hash = marker?.experimentHash;
                    const change = marker?.changeDetail;
                    const lines: string[] = [];
                    if (hash) lines.push(`Experiment Hash To Reload: ${hash}`);
                    if (change) lines.push(`Changed: ${change}`);
                    return lines;
                }
                return `Value: ${context.parsed.y}`;
            }
        }
    };

    // Keep title in sync if provided
    if (graphName && chart.options.plugins?.title) {
        chart.options.plugins.title.display = true;
        chart.options.plugins.title.text = graphName;
    }

    // Gentle tension for smoother appearance after smoothing
    datasets[2].tension = 0;

    // Auto-fit axes if user hasn't zoomed/panned yet
    // Each chart maintains independent axis ranges
    if (!entry.userZoomed) {
        const lastX = entry.rawPoints.length ? entry.rawPoints[entry.rawPoints.length - 1].x : undefined;

        // Ensure scales exist and are independent (not shared)
        if (!chart.options.scales) {
            chart.options.scales = {};
        }
        if (!chart.options.scales.x) {
            chart.options.scales.x = {};
        }
        if (!chart.options.scales.y) {
            chart.options.scales.y = {};
        }

        // Set independent min/max for this chart only
        chart.options.scales.x.min = 0;
        chart.options.scales.x.max = lastX;
        chart.options.scales.y.min = 0;
        chart.options.scales.y.max = undefined;
    }

    entry.pending = true;
}

function openSignalSettings(signalName: string): void {
    const entry = signalCharts.get(signalName);
    if (!entry) return;

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.background = 'var(--bg, #fff)';
    modal.style.color = 'var(--fg, #111)';
    modal.style.padding = '16px';
    modal.style.borderRadius = '8px';
    modal.style.minWidth = '320px';
    modal.style.boxShadow = '0 8px 30px rgba(0,0,0,0.25)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.gap = '12px';

    const title = document.createElement('div');
    title.textContent = `Settings • ${signalName}`;
    title.style.fontWeight = '600';
    modal.appendChild(title);

    const colorRow = document.createElement('div');
    colorRow.style.display = 'flex';
    colorRow.style.alignItems = 'center';
    colorRow.style.justifyContent = 'space-between';
    const colorLabel = document.createElement('span');
    colorLabel.textContent = 'Curve color';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = entry.color;
    colorInput.style.width = '48px';
    colorInput.style.height = '32px';
    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorInput);
    modal.appendChild(colorRow);

    const smoothingRow = document.createElement('div');
    smoothingRow.style.display = 'flex';
    smoothingRow.style.alignItems = 'center';
    smoothingRow.style.justifyContent = 'space-between';
    const smoothingLabel = document.createElement('span');
    smoothingLabel.textContent = 'Enable smoothing';
    const smoothingToggle = document.createElement('input');
    smoothingToggle.type = 'checkbox';
    smoothingToggle.checked = entry.smoothingEnabled;
    smoothingRow.appendChild(smoothingLabel);
    smoothingRow.appendChild(smoothingToggle);
    modal.appendChild(smoothingRow);

    const factorRow = document.createElement('div');
    factorRow.style.display = 'flex';
    factorRow.style.alignItems = 'center';
    factorRow.style.gap = '8px';
    const factorLabel = document.createElement('span');
    factorLabel.textContent = 'Smoothing factor';
    const factorInput = document.createElement('input');
    factorInput.type = 'range';
    factorInput.min = '0';
    factorInput.max = '0.99';
    factorInput.step = '0.05';
    factorInput.value = entry.smoothingFactor.toString();
    factorInput.style.flex = '1';
    const factorVal = document.createElement('span');
    factorVal.textContent = entry.smoothingFactor.toFixed(2);
    factorInput.oninput = () => { factorVal.textContent = parseFloat(factorInput.value).toFixed(2); };
    factorRow.appendChild(factorLabel);
    factorRow.appendChild(factorInput);
    factorRow.appendChild(factorVal);
    modal.appendChild(factorRow);

    const stdRow = document.createElement('div');
    stdRow.style.display = 'flex';
    stdRow.style.alignItems = 'center';
    stdRow.style.justifyContent = 'space-between';
    const stdLabel = document.createElement('span');
    stdLabel.textContent = 'Show std band';
    const stdToggle = document.createElement('input');
    stdToggle.type = 'checkbox';
    stdToggle.checked = entry.stdEnabled;
    stdRow.appendChild(stdLabel);
    stdRow.appendChild(stdToggle);
    modal.appendChild(stdRow);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.gap = '8px';
    actionsRow.style.justifyContent = 'flex-end';

    const resetXBtn = document.createElement('button');
    resetXBtn.textContent = 'Reset X';
    resetXBtn.onclick = () => {
        const lastX = entry.rawPoints.length ? entry.rawPoints[entry.rawPoints.length - 1].x : undefined;
        entry.chart.options.scales!.x!.min = 0;
        entry.chart.options.scales!.x!.max = lastX;
        entry.userZoomed = false;
        entry.chart.update('none');
    };

    const resetYBtn = document.createElement('button');
    resetYBtn.textContent = 'Reset Y to 0';
    resetYBtn.onclick = () => {
        entry.chart.options.scales!.y!.min = 0;
        entry.chart.options.scales!.y!.max = undefined;
        entry.userZoomed = false;
        entry.chart.update('none');
    };

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.onclick = () => {
        entry.color = colorInput.value;
        entry.smoothingEnabled = smoothingToggle.checked;
        entry.smoothingFactor = parseFloat(factorInput.value);
        entry.stdEnabled = stdToggle.checked;
        localStorage.setItem(`signal-color-${signalName}`, entry.color);

        refreshSignalChart(entry, signalName);
        entry.userZoomed = false;
        entry.chart.update('none');
        document.body.removeChild(overlay);
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
    };

    actionsRow.appendChild(resetXBtn);
    actionsRow.appendChild(resetYBtn);
    actionsRow.appendChild(applyBtn);
    actionsRow.appendChild(closeBtn);
    modal.appendChild(actionsRow);

    overlay.appendChild(modal);
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };

    document.body.appendChild(overlay);
}

/**
 * Global plot settings dialog for configuring refresh interval
 */
function openGlobalPlotSettings(): void {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.background = 'var(--bg, #fff)';
    modal.style.color = 'var(--fg, #111)';
    modal.style.padding = '16px';
    modal.style.borderRadius = '8px';
    modal.style.minWidth = '350px';
    modal.style.boxShadow = '0 8px 30px rgba(0,0,0,0.25)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.gap = '12px';

    const title = document.createElement('div');
    title.textContent = 'Plot Settings';
    title.style.fontWeight = '600';
    title.style.fontSize = '16px';
    modal.appendChild(title);

    const currentInterval = localStorage.getItem('plot-refresh-interval-ms') || '2000';

    const intervalRow = document.createElement('div');
    intervalRow.style.display = 'flex';
    intervalRow.style.alignItems = 'center';
    intervalRow.style.justifyContent = 'space-between';
    intervalRow.style.gap = '12px';

    const intervalLabel = document.createElement('span');
    intervalLabel.textContent = 'Plot refresh interval (ms)';
    intervalLabel.style.flex = '1';

    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.min = '2000';
    intervalInput.max = '60000';
    intervalInput.step = '100';
    intervalInput.value = currentInterval;
    intervalInput.style.width = '100px';
    intervalInput.style.padding = '4px';
    intervalInput.style.border = '1px solid var(--border-subtle, #ccc)';
    intervalInput.style.borderRadius = '4px';

    const intervalNote = document.createElement('div');
    intervalNote.style.fontSize = '12px';
    intervalNote.style.color = 'var(--text-secondary, #666)';
    intervalNote.style.marginTop = '4px';
    intervalNote.textContent = 'Minimum: 2000 ms. This setting controls how frequently plots update from new data.';

    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalInput);
    modal.appendChild(intervalRow);
    modal.appendChild(intervalNote);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.gap = '8px';
    actionsRow.style.justifyContent = 'flex-end';
    actionsRow.style.marginTop = '8px';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.padding = '6px 16px';
    applyBtn.style.backgroundColor = 'var(--accent-color, #007aff)';
    applyBtn.style.color = '#fff';
    applyBtn.style.border = 'none';
    applyBtn.style.borderRadius = '4px';
    applyBtn.style.cursor = 'pointer';
    applyBtn.onclick = () => {
        const value = parseInt(intervalInput.value, 10);
        if (isNaN(value)) {
            alert('Please enter a valid number');
            return;
        }
        if (value < 2000) {
            alert('Minimum interval is 2000 ms');
            intervalInput.value = '2000';
            return;
        }
        if (value > 60000) {
            alert('Maximum interval is 60000 ms');
            intervalInput.value = '60000';
            return;
        }

        // Save to localStorage
        localStorage.setItem('plot-refresh-interval-ms', value.toString());
        console.log(`📊 Plot refresh interval updated to ${value}ms`);

        // The polling loop will pick up the new interval on the next cycle
        document.body.removeChild(overlay);
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.padding = '6px 16px';
    closeBtn.style.backgroundColor = 'var(--bg-secondary, #f0f0f0)';
    closeBtn.style.color = 'var(--fg, #111)';
    closeBtn.style.border = '1px solid var(--border-subtle, #ccc)';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
    };

    actionsRow.appendChild(applyBtn);
    actionsRow.appendChild(closeBtn);
    modal.appendChild(actionsRow);

    overlay.appendChild(modal);
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };

    document.body.appendChild(overlay);
}

function exportSignalDataCSV(signalName: string, data: SignalPoint[]): void {
    const csv = ['model_age,signal_value'];
    data.forEach(point => {
        csv.push(`${point.x},${point.y}`);
    });
    const csvContent = csv.join('\n');
    downloadFile(csvContent, `${signalName}.csv`, 'text/csv');
}

function exportSignalDataJSON(signalName: string, data: SignalPoint[]): void {
    const json = {
        signal_name: signalName,
        timestamp: new Date().toISOString(),
        points: data,
    };
    const jsonContent = JSON.stringify(json, null, 2);
    downloadFile(jsonContent, `${signalName}.json`, 'application/json');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}




// --- Chat History Helper ---
function addChatMessage(text: string, type: 'user' | 'agent', isTyping: boolean = false): HTMLElement | null {
    const list = document.getElementById('chat-history-list');
    const panel = document.getElementById('chat-history-panel');
    if (!list || !panel) return null;

    // Ensure panel is visible
    panel.style.display = 'flex';

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
        bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    } else if (type === 'agent') {
        // Simple heuristic to highlight numbers or code-like tokens
        bubble.innerHTML = text.replace(/`([^`]+)`/g, '<code>$1</code>');
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


function generateSplitColor(split: string, index: number, _total: number): string {
    // Match the hardcoded colors from GridCell.ts (without alpha for color pickers)
    const splitLower = split.toLowerCase();
    if (splitLower === 'train') {
        return '#c57a09';
    } else if (splitLower === 'eval' || splitLower === 'val' || splitLower === 'test' || splitLower === 'validation') {
        return '#16bb07';
    }

    // For other splits, use safe hue ranges to avoid muddy / inaccessible colors
    const safeRanges: Array<[number, number]> = [
        [10, 40],   // warm orange range
        [80, 150],  // greens
        [190, 240], // blues
        [260, 300], // purples
    ];

    const rangeIndex = index % safeRanges.length;
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
            // Sort splits by preferred order using regex patterns: train, val, test/eval, then others
            const preferredPatterns = [
                /^train/i,           // train, training, train_set, etc.
                /^val/i,             // val, validation, val_set, etc.
                /^test/i,            // test, testing, test_set, etc.
                /^eval/i,            // eval, evaluation, eval_set, etc.
            ];

            availableSplits = response.splitNames.sort((a, b) => {
                const aIdx = preferredPatterns.findIndex(p => p.test(a));
                const bIdx = preferredPatterns.findIndex(p => p.test(b));
                if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
                if (aIdx === -1) return 1;
                if (bIdx === -1) return -1;
                return aIdx - bIdx;
            });

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
                const lcKey = `${split.toLowerCase()}-color`;
                const savedColor = localStorage.getItem(lcKey);
                input.value = savedColor || generateSplitColor(split, index, availableSplits.length);

                // Save to localStorage on change and update display
                input.addEventListener('input', () => {
                    localStorage.setItem(lcKey, input.value);
                    updateDisplayOnly();
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
        ['eval', 'test'],
        ['val', 'eval'],
        ['validation', 'eval'],
        ['evaluation', 'eval'],
        ['test', 'eval'],
    ];

    const allSplits = availableSplits && availableSplits.length > 0 ? availableSplits : ['train', 'eval'];

    allSplits.forEach((split, index) => {
        const lcKey = `${split.toLowerCase()}-color`;
        const saved = localStorage.getItem(lcKey);
        colors[split.toLowerCase()] = saved || generateSplitColor(split, index, allSplits.length);
    });

    // Ensure aliases resolve to existing colors (bidirectional)
    aliasPairs.forEach(([alias, target]) => {
        const targetColor = colors[target.toLowerCase()];
        const aliasColor = colors[alias.toLowerCase()];

        if (targetColor && !aliasColor) {
            colors[alias.toLowerCase()] = targetColor;
        } else if (aliasColor && !targetColor) {
            colors[target.toLowerCase()] = aliasColor;
        }
    });

    // Absolute fallbacks to ensure type safety and basic colors
    if (!colors['train']) colors['train'] = '#c57a09';
    if (!colors['eval']) colors['eval'] = '#16bb07';

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
    if (!datasetInfoReady) {
        console.debug('[fetchAndDisplaySamples] Dataset info not ready; skipping initial fetch.');
        return;
    }
    if (!displayOptionsPanel) {
        console.warn('displayOptionsPanel not initialized');
        return;
    }
    console.debug('[Fetch Samples] Starting fetch and display of samples at ' + new Date().toISOString() + '...');

    const startRaw = traversalPanel.getStartIndex();
    const countRaw = traversalPanel.getLeftSamples();
    const start = Number.isFinite(Number(startRaw)) ? Number(startRaw) : 0;
    const count = Number.isFinite(Number(countRaw)) ? Number(countRaw) : 0;

    if (count <= 0) {
        console.debug('[Fetch Samples] count <= 0, aborting fetch');
        return;
    }
    const batchSize = Math.min(gridManager.calculateGridDimensions().gridCount, 128);

    const requestId = ++currentFetchRequestId;

    // gridManager.clearAllCells();

    // Get resolution settings once
    const resolutionPercent = traversalPanel.getImageResolutionPercent();
    let resizeWidth = 0;
    let resizeHeight = 0;

    if (resolutionPercent > 0 && resolutionPercent <= 100) {
        resizeWidth = -resolutionPercent;
        resizeHeight = -resolutionPercent;
    } else {
        const cellSize = gridManager.calculateGridDimensions().cellSize;
        resizeWidth = cellSize;
        resizeHeight = cellSize;
    }

    // Check cache first for the entire batch
    const cachedResponse = getCachedResponse(start, count, resizeWidth, resizeHeight);
    if (cachedResponse && cachedResponse.success && cachedResponse.dataRecords.length > 0) {
        // Display from cache
        const preferences = displayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();
        cachedResponse.dataRecords.forEach((record, index) => {
            // Apply locally-tracked discard state to maintain consistency across refreshes
            const denyListedStat = record.dataStats.find(stat => stat.name === 'deny_listed');
            if (denyListedStat && locallyDiscardedSampleIds.has(record.sampleId)) {
                denyListedStat.value = [1]; // Ensure deny_listed is 1 if locally tracked
            } else if (denyListedStat && !locallyDiscardedSampleIds.has(record.sampleId)) {
                denyListedStat.value = [0]; // Ensure deny_listed is 0 if not locally tracked
            }

            const cell = gridManager.getCellbyIndex(index);
            if (cell) {
                cell.populate(record, preferences);
            }
        });
        console.debug(`[Cache] Displayed ${cachedResponse.dataRecords.length} cached records`);

        // Update range labels on scrollbar
        traversalPanel.updateRangeLabels();

        // Keep left metadata panel in sync with the latest records (even if cached)
        displayOptionsPanel.populateOptions(cachedResponse.dataRecords);

        // Trigger prefetch of multiple batches ahead in background
        prefetchMultipleBatches(start, count, resizeWidth, resizeHeight);
        return;
    }

    try {
        let totalRecordsRetrieved = 0;
        const allRecords: any[] = [];

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
                    // Apply locally-tracked discard state to maintain consistency
                    const denyListedStat = record.dataStats.find(stat => stat.name === 'deny_listed');
                    if (denyListedStat && locallyDiscardedSampleIds.has(record.sampleId)) {
                        denyListedStat.value = [1]; // Ensure deny_listed is 1 if locally tracked
                    } else if (denyListedStat && !locallyDiscardedSampleIds.has(record.sampleId)) {
                        denyListedStat.value = [0]; // Ensure deny_listed is 0 if not locally tracked
                    }

                    const cell = gridManager.getCellbyIndex(i + index);
                    if (cell) {
                        cell.populate(record, preferences);
                    } else {
                        console.warn(`Cell at index ${i + index} not found`);
                    }
                });

                // Collect records for caching
                allRecords.push(...response.dataRecords);
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

        // Cache the complete response
        if (allRecords.length > 0) {
            const completeResponse: DataSamplesResponse = {
                success: true,
                message: '',
                dataRecords: allRecords
            };
            setCachedResponse(start, count, resizeWidth, resizeHeight, completeResponse);
            if (displayOptionsPanel) {
                displayOptionsPanel.populateOptions(allRecords);
            }
        }

        // Update range labels on scrollbar
        traversalPanel.updateRangeLabels();

        // // Trigger prefetch of batches both ahead and behind based on navigation direction
        prefetchBidirectionalBatches(start, count, resizeWidth, resizeHeight, lastFetchedBatchStart);
        lastFetchedBatchStart = start; // Update for next navigation

    } catch (error) {
        // Error is already logged by fetchSamples, so we just catch to prevent unhandled promise rejection.
        console.debug("fetchAndDisplaySamples failed. See error above.");
    }
}

async function prefetchBidirectionalBatches(currentStart: number, count: number, resizeWidth: number, resizeHeight: number, lastStart: number = 0, totalBatches: number = MAX_PREFETCH_BATCHES): Promise<void> {
    if (prefetchInProgress) {
        console.debug('[Prefetch] Already in progress, skipping');
        return;
    }
    console.debug('[PrefetchBi] Starting prefetch of batches...');

    prefetchInProgress = true;
    const maxSampleId = traversalPanel.getMaxSampleId();
    const batchesToPrefetch: number[] = [];

    // Calculate how many batches we can go backward and forward
    const maxBackwardBatches = Math.floor(currentStart / count);
    const maxForwardBatches = Math.floor((maxSampleId - currentStart) / count);

    // Split prefetch batches: 2/3 forward, 1/3 backward (directional allocation)
    // Forward is the primary direction for optimal UX - most users scroll forward
    let targetForward = Math.ceil(totalBatches * 2 / 3);
    let targetBackward = Math.floor(totalBatches * 1 / 3);

    // Special case: if only 1 batch available, allocate to forward (unless at end)
    if (totalBatches === 1) {
        if (maxForwardBatches > 0) {
            targetForward = 1;
            targetBackward = 0;
        } else if (maxBackwardBatches > 0) {
            // At the end of dataset, allocate the single batch to backward
            targetForward = 0;
            targetBackward = 1;
        }
    }

    // Adjust if we're near boundaries
    const availableBackward = Math.min(targetBackward, maxBackwardBatches);
    const availableForward = Math.min(targetForward, maxForwardBatches);

    // If we can't reach target in one direction, use extra in the other
    if (availableBackward < targetBackward && availableForward < maxForwardBatches) {
        // Near the beginning: use more forward batches
        targetForward = Math.min(totalBatches - availableBackward, maxForwardBatches);
    } else if (availableForward < targetForward && availableBackward < maxBackwardBatches) {
        // Near the end: use more backward batches
        targetBackward = Math.min(totalBatches - availableForward, maxBackwardBatches);
    }

    console.debug(`[Prefetch] Position: ${currentStart}, Direction: forward=${availableForward}/${targetForward} backward=${availableBackward}/${targetBackward}, Available F=${maxForwardBatches} B=${maxBackwardBatches}`);

    // Collect backward batches
    for (let i = 1; i <= targetBackward; i++) {
        const batchStart = currentStart - (count * i);
        if (batchStart < 0) break;

        const cached = getCachedResponse(batchStart, count, resizeWidth, resizeHeight);
        if (!cached) {
            batchesToPrefetch.push(batchStart);
            console.debug('[Prefetch] Adding backward batch at', batchStart);
        }
    }

    // Collect forward batches
    for (let i = 1; i <= targetForward; i++) {
        const batchStart = currentStart + (count * i);
        if (batchStart > maxSampleId) break;

        const cached = getCachedResponse(batchStart, count, resizeWidth, resizeHeight);
        if (!cached) {
            batchesToPrefetch.push(batchStart);
            console.debug('[Prefetch] Adding forward batch at', batchStart);
        }
    }

    if (batchesToPrefetch.length === 0) {
        console.debug('[Prefetch] All needed batches already cached');
        prefetchInProgress = false;
        return;
    }

    console.debug(`[Prefetch] Loading ${batchesToPrefetch.length} batches: ${batchesToPrefetch.join(', ')}`);

    try {
        const batchSize = Math.min(gridManager.calculateGridDimensions().gridCount, 128);

        // Prefetch each batch
        for (const batchStart of batchesToPrefetch) {
            const allRecords: any[] = [];

            for (let i = 0; i < count; i += batchSize) {
                const currentBatchSize = Math.min(batchSize, count - i);
                const request: DataSamplesRequest = {
                    startIndex: batchStart + i,
                    recordsCnt: currentBatchSize,
                    includeRawData: true,
                    includeTransformedData: false,
                    statsToRetrieve: [],
                    resizeWidth: resizeWidth,
                    resizeHeight: resizeHeight
                };

                const response = await fetchSamples(request);

                if (response.success && response.dataRecords.length > 0) {
                    allRecords.push(...response.dataRecords);

                    if (response.dataRecords.length < currentBatchSize) {
                        break;
                    }
                } else {
                    break;
                }
            }

            if (allRecords.length > 0) {
                const completeResponse: DataSamplesResponse = {
                    success: true,
                    message: '',
                    dataRecords: allRecords
                };
                setCachedResponse(batchStart, count, resizeWidth, resizeHeight, completeResponse);
                console.debug(`[Prefetch] Cached batch at ${batchStart} (${allRecords.length} records)`);
            }
        }
    } catch (error) {
        console.debug('[Prefetch] Failed:', error);
    } finally {
        prefetchInProgress = false;
    }
}

async function prefetchMultipleBatches(currentStart: number, count: number, resizeWidth: number, resizeHeight: number, batchesAhead: number = MAX_PREFETCH_BATCHES): Promise<void> {
    if (prefetchInProgress) {
        console.debug('[Prefetch] Already in progress, skipping');
        return;
    }
    console.debug('[PrefetchMul] Starting prefetch of batches...');

    prefetchInProgress = true;
    const maxSampleId = traversalPanel.getMaxSampleId();
    const batchesToPrefetch: number[] = [];

    // Determine which batches to prefetch (next 3 batches: 2, 3, 4 by default)
    for (let i = 1; i <= batchesAhead; i++) {
        const batchStart = currentStart + (count * i);
        // Check if batch start is within dataset bounds
        if (batchStart > maxSampleId) {
            console.debug(`[Prefetch] Batch ${batchStart} exceeds max sample ID ${maxSampleId}, stopping`);
            break;
        }

        // Only add if not already cached
        const cached = getCachedResponse(batchStart, count, resizeWidth, resizeHeight);
        if (!cached) {
            batchesToPrefetch.push(batchStart);
            console.debug('[Prefetch] Adding in cache batch starting at', batchStart);
        }
    }

    if (batchesToPrefetch.length === 0) {
        console.debug('[Prefetch] All upcoming batches already cached or at end of dataset');
        prefetchInProgress = false;
        return;
    }

    console.debug(`[Prefetch] Loading ${batchesToPrefetch.length} batches ahead: ${batchesToPrefetch.join(', ')}`);

    try {
        const batchSize = Math.min(gridManager.calculateGridDimensions().gridCount, 128);

        // Prefetch each batch
        for (const batchStart of batchesToPrefetch) {
            const allRecords: any[] = [];

            for (let i = 0; i < count; i += batchSize) {
                const currentBatchSize = Math.min(batchSize, count - i);
                const request: DataSamplesRequest = {
                    startIndex: batchStart + i,
                    recordsCnt: currentBatchSize,
                    includeRawData: true,
                    includeTransformedData: false,
                    statsToRetrieve: [],
                    resizeWidth: resizeWidth,
                    resizeHeight: resizeHeight
                };

                const response = await fetchSamples(request);

                if (response.success && response.dataRecords.length > 0) {
                    allRecords.push(...response.dataRecords);

                    if (response.dataRecords.length < currentBatchSize) {
                        break;
                    }
                } else {
                    break;
                }
            }

            if (allRecords.length > 0) {
                const completeResponse: DataSamplesResponse = {
                    success: true,
                    message: '',
                    dataRecords: allRecords
                };
                setCachedResponse(batchStart, count, resizeWidth, resizeHeight, completeResponse);
                console.debug(`[Prefetch] Cached batch starting at ${batchStart} (${allRecords.length} records)`);
            }
        }
    } catch (error) {
        console.debug('[Prefetch] Failed:', error);
    } finally {
        prefetchInProgress = false;
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

    // Clear cache since image dimensions will change
    // clearResponseCache();

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
        const response: DataQueryResponse = await dataClient.applyDataQuery(request).response;

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
        clearResponseCache();

        fetchAndDisplaySamples();
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

    // Wait for the minimum spin time if it hasn't elapsed yet
    await minSpinDuration;

    if (refreshBtn) refreshBtn.classList.remove('refreshing');
}


export async function initializeUIElements() {
    cellsContainer = document.getElementById('cells-grid') as HTMLElement;
    initSignalsBoard();

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
            chatInput.disabled = true;

            // 1. Add User Message immediately
            addChatMessage(query, 'user');
            chatInput.value = '';

            // 2. Add Typing indicator
            const typingMsg = addChatMessage('', 'agent', true);

            try {
                await handleQuerySubmit(query);
            } catch (error: any) {
                console.error("Query failed:", error);
                // 3. Add Error Message to history
                addChatMessage(`Error: ${error.message || "Unknown error"}`, 'agent');
            } finally {
                // Remove typing indicator if it exists
                if (typingMsg) typingMsg.remove();
                // Reset state
                chatSendBtn.disabled = false;
                chatSendBtn.classList.remove('loading');
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
            await submitQuery();
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
                updateLayout();
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
                    if ((window ).trainingTotalSteps !== newTotal) {
                        console.log(`📊 Training total steps updated: ${(window ).trainingTotalSteps} -> ${newTotal}`);
                        (window ).trainingTotalSteps = newTotal;

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
        async function fetchInitialTrainingState(retries = 5, initialDelay = 2000): Promise<boolean> {
            let delay = initialDelay;

            for (let attempt = 0; attempt < retries; attempt++) {
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
                    if (attempt < retries - 1) {
                        console.log(`Retry ${attempt + 1}/${retries} to fetch training state in ${delay}ms...`);

                        // Show visual feedback that we're retrying in the separate status label
                        if (connectionStatusElement) {
                            connectionStatusElement.textContent = `Connecting... (${attempt + 1}/${retries})`;
                        }
                        if (trainingStatePill) {
                            trainingStatePill.classList.add('pill-paused');
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

        // Fetch splits from backend (if supported) and build color pickers dynamically
        await fetchAndCreateSplitColorPickers();

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
                setTimeout(updateLayout, 150);
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
    if (displayOptionsPanel) {
        displayOptionsPanel.onUpdate(updateDisplayOnly);
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

    // Initialize grid layout BEFORE setting up any data fetching to ensure proper dimensions
    gridManager.updateGridLayout();
    const initialGridDims = gridManager.calculateGridDimensions();
    traversalPanel.updateSliderStep(initialGridDims.gridCount);
    console.log(`[Init] Initial grid dimensions set: ${JSON.stringify(initialGridDims)}`);

    traversalPanel.onUpdate(() => {
        debouncedFetchAndDisplay();
        if (fetchTimeout) clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(updateLayout, 150);
    });

    window.addEventListener('resize', () => {
        updateLayout();
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

        const openConfig = (e: Event) => {
            e.preventDefault();
            if (refreshPopover && refreshInput && refreshAutoToggle) {
                const currentSeconds = Math.round(refreshIntervalMs / 1000);

                // Initialize UI state
                refreshAutoToggle.checked = refreshIntervalMs > 0;
                refreshInput.value = currentSeconds > 0 ? currentSeconds.toString() : "5";

                if (refreshInputWrapper) {
                    refreshInputWrapper.classList.toggle('disabled', !refreshAutoToggle.checked);
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

        if (refreshSaveBtn && refreshPopover && refreshInput && refreshAutoToggle) {
            refreshSaveBtn.addEventListener('click', () => {
                if (!refreshAutoToggle.checked) {
                    refreshIntervalMs = 0;
                } else {
                    const newSeconds = parseInt(refreshInput.value);
                    if (!isNaN(newSeconds) && newSeconds > 0) {
                        refreshIntervalMs = newSeconds * 1000;
                    } else {
                        // Fallback/Default if they checked it but entered something weird
                        refreshIntervalMs = 5000;
                    }
                }

                localStorage.setItem('refresh-interval', refreshIntervalMs.toString());
                startRefreshInterval();
                refreshPopover.classList.add('hidden');
            });

            // Close on Escape or Save on Enter
            refreshInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') refreshSaveBtn.click();
                if (e.key === 'Escape') refreshPopover.classList.add('hidden');
            });
        }

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            const isOutsidePopover = refreshPopover && !refreshPopover.contains(e.target as Node);
            const isNotMainBtn = refreshBtn !== e.target && !refreshBtn.contains(e.target as Node);
            const isNotTrigger = refreshTrigger !== e.target && !refreshTrigger.contains(e.target as Node);

            if (isOutsidePopover && isNotMainBtn && isNotTrigger) {
                refreshPopover.classList.add('hidden');
            }
        });
    }

    setTimeout(updateLayout, 0);

    // Painter Mode UI Initialization
    const painterToggle = document.getElementById('painter-toggle') as HTMLInputElement;
    const painterTagsList = document.getElementById('painter-tags-list') as HTMLElement;
    const painterNewTagBtn = document.getElementById('painter-new-tag') as HTMLButtonElement;
    const newTagInput = document.getElementById('new-tag-input') as HTMLInputElement;
    const modeSwitcherContainer = document.getElementById('mode-switcher-container') as HTMLElement;

    if (painterToggle) {
        painterToggle.addEventListener('change', () => {
            isPainterMode = painterToggle.checked;

            // Show/hide the mode switcher (+/-) based on Painter toggle
            if (modeSwitcherContainer) {
                modeSwitcherContainer.style.display = isPainterMode ? 'flex' : 'none';
            }

            // Enable/disable tag interactions based on mode
            if (isPainterMode) {
                cellsContainer?.classList.add('painter-active');
                clearSelection();

                // If no brush active, auto-select first one
                if (activeBrushTags.size === 0 && uniqueTags.length > 0) {
                    setActiveBrush(uniqueTags[0]);
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
            isPainterRemoveMode = false;
            modeAddBtn.classList.add('active');
            modeAddBtn.classList.remove('remove-mode');
            modeRemoveBtn.classList.remove('active', 'remove-mode');
        });

        modeRemoveBtn.addEventListener('click', () => {
            isPainterRemoveMode = true;
            modeRemoveBtn.classList.add('active', 'remove-mode');
            modeAddBtn.classList.remove('active');
        });
    }
}

// ===== TRAINING PROGRESS STREAM =====
let isStreamRunning = false;
let trainingStreamAbortController: AbortController | null = null;
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
        if ((window ).trainingTotalSteps) {
            const total = (window ).trainingTotalSteps;
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
        const stored = localStorage.getItem('plot-refresh-interval-ms');
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed >= 2000) {
                return parsed;
            }
        }
        return 2000;  // Default 2 seconds, minimum allowed
    };

    let POLL_INTERVAL_MS = getPlotRefreshInterval();
    let isFirstPoll = true;  // Track if this is the first poll (full history) or incremental
    let lastRefreshIntervalCheck = Date.now();
    const REFRESH_INTERVAL_CHECK_MS = 1000;  // Check for interval changes every 1 second

    // Get max points from environment variable or use default
    const getMaxPoints = (): number => {
        const envValue = (window ).WS_PLOT_MAX_POINTS_REQUEST;
        if (envValue !== undefined && envValue !== null) {
            const parsed = parseInt(String(envValue), 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 1000;  // Default value
    };

    async function pollLoggerData() {
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
                const entry = getOrCreateSignalChart(metricName);
                if (!entry) continue;

                const mapped = signalPoints.map((pt) => ({
                    x: pt.modelAge,
                    y: pt.metricValue,
                    experimentHash: pt.experimentHash,
                })).sort((a, b) => a.x - b.x);

                // Log the step range for this batch
                if (mapped.length > 0) {
                    const minStep = mapped[0].x;
                    const maxStep = mapped[mapped.length - 1].x;
                    console.log(`📊 ${metricName} plot update from ${minStep} to ${maxStep} steps (${mapped.length} points)`);
                }

                if (requestFullHistory || entry.rawPoints.length === 0) {
                    // Full history: replace all data
                    entry.rawPoints = mapped;
                } else {
                    // Incremental: only add new points
                    const lastX = entry.rawPoints[entry.rawPoints.length - 1]?.x ?? -Infinity;
                    mapped.forEach(p => {
                        if (p.x > lastX) {
                            entry.rawPoints.push(p);
                        }
                    });
                }

                // Limit history size
                if (entry.rawPoints.length > SIGNAL_HISTORY_LIMIT) {
                    entry.rawPoints.splice(0, entry.rawPoints.length - SIGNAL_HISTORY_LIMIT);
                }

                // Update metrics and progress
                if (entry.rawPoints.length > 0) {
                    const latest = entry.rawPoints[entry.rawPoints.length - 1];
                    updateProgress(latest.x);
                    // Track metric with timestamp: only show metrics updated in current poll
                    latestMetrics.set(metricName, { value: latest.y, timestamp: Date.now() });
                }

                // Refresh chart immediately for this metric
                refreshSignalChart(entry, metricName, metricName);
                entry.chart.update('none');
                console.log(`📊 Chart updated for ${metricName} with ${entry.rawPoints.length} points`);
            }

            // After first successful poll, switch to incremental mode
            if (isFirstPoll) {
                isFirstPoll = false;
                console.log('📊 Switched to incremental polling mode');
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

    setupPolling();

    async function ensureTotalSteps() {
        if ((window ).trainingTotalSteps) return true;
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
                (window ).trainingTotalSteps = total;
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

    startSignalUpdateLoop();

    // Polling loop runs as long as the stream is "active"
    // Note: We're now using polling exclusively, no streaming
    await ensureTotalSteps();
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
    if (!isPainterMode && !e.ctrlKey && !e.metaKey) {
        if (!cell || !selectedCells.has(cell)) {
            clearSelection();
        }
    }

    // Start dragging
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    if (isPainterMode) {
        // Painter Mode: Apply tag immediately on click/down
        if (cell) {
            paintCell(cell);
        }
    } else {
        // Normal Mode: Start selection box
        createSelectionBox();
        selectionBox!.style.left = `${startX}px`;
        selectionBox!.style.top = `${startY}px`;
        selectionBox!.style.width = '0px';
        selectionBox!.style.height = '0px';
        selectionBox!.style.display = 'block';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    if (isPainterMode) {
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

    if (isPainterMode) return; // Painter mode doesn't do selection on mouseup

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

    // Determine if all selected cells are discarded, all not discarded, or mixed
    let allDiscarded = true;
    let anyDiscarded = false;

    for (const cell of selectedCells) {
        const isDiscarded = cell.classList.contains('discarded');
        if (isDiscarded) {
            anyDiscarded = true;
        } else {
            allDiscarded = false;
        }
    }

    // Show/hide restore option based on selection
    const discardBtn = contextMenu.querySelector('[data-action="discard"]') as HTMLElement;
    const restoreBtn = contextMenu.querySelector('[data-action="restore"]') as HTMLElement;

    if (anyDiscarded && allDiscarded) {
        // All selected cells are discarded: show restore, hide discard
        if (discardBtn) discardBtn.style.display = 'none';
        if (restoreBtn) restoreBtn.style.display = 'block';
    } else if (anyDiscarded && !allDiscarded) {
        // Mixed: show both
        if (discardBtn) discardBtn.style.display = 'block';
        if (restoreBtn) restoreBtn.style.display = 'block';
    } else {
        // None discarded: show discard, hide restore
        if (discardBtn) discardBtn.style.display = 'block';
        if (restoreBtn) restoreBtn.style.display = 'none';
    }
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

        const validSelections = Array.from(selectedCells)
            .map(c => getGridCell(c)?.getRecord())
            .filter((r): r is any => !!r)
            .map(r => {
                const idNum = Number(r.sampleId);
                if (!Number.isFinite(idNum)) return null;
                const originStat = r.dataStats.find((stat: any) => stat.name === 'origin');
                return { id: idNum, origin: originStat?.valueString ?? '' };
            })
            .filter((x): x is { id: number; origin: string } => !!x);

        const sample_ids = validSelections.map(v => v.id);
        const origins = validSelections.map(v => v.origin);

        if (sample_ids.length === 0) {
            console.warn('No valid sample_ids to edit; skipping action');
            hideContextMenu();
            return;
        }

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
                clearSelection();
                debouncedFetchAndDisplay();
                break;
            case 'discard':
                await ensureTrainingPaused();
                let newlyDiscardedCount = 0;
                // Track discarded samples locally to maintain state across refreshes
                sample_ids.forEach(id => {
                     locallyDiscardedSampleIds.add(id);
                });

                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        // Check if already discarded to avoid double counting
                        const isDiscardedStat = record?.dataStats.find((s: any) => s.name === 'deny_listed');
                        const isAlreadyDiscarded = isDiscardedStat?.value?.[0] === 1; // Assuming value is [1] for true

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
                debouncedFetchAndDisplay();
                break;
            case 'undiscard':
                await ensureTrainingPaused();

                let newlyRestoredCount = 0;
                selectedCells.forEach(cell => {
                    const gridCell = getGridCell(cell);
                    if (gridCell) {
                        const record = gridCell.getRecord();
                        // Check if currently discarded
                        const isDiscardedStat = record?.dataStats.find((s: any) => s.name === 'deny_listed');
                        const isCurrentlyDiscarded = isDiscardedStat?.value?.[0] === 1;

                        if (isCurrentlyDiscarded) {
                            newlyRestoredCount++;
                        }

                        gridCell.updateStats({ deny_listed: 0 });
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
                debouncedFetchAndDisplay();
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
            const statItem = document.createElement('div');
            statItem.className = 'modal-stat-item';

            let value = '';

            // Handle string values
            if (stat.valueString !== undefined && stat.valueString !== '') {
                value = stat.valueString;
            }
            // Handle scalar values (in value array)
            else if (stat.value && stat.value.length > 0) {
                if (stat.value.length === 1) {
                    // Single scalar value
                    const num = stat.value[0];
                    if (typeof num === 'number' && Number.isNaN(num)) {
                        value = '';
                    } else {
                        value = typeof num === 'number' && num % 1 !== 0
                            ? num.toFixed(4)
                            : String(num);
                    }
                } else {
                    // Array of values - show first few
                    const vals = stat.value.slice(0, 3)
                        .filter((v: number) => !(typeof v === 'number' && Number.isNaN(v)))
                        .map((v: number) => typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : String(v));
                    value = vals.join(', ');
                    if (stat.value.length > 3) {
                        value += '...';
                    }
                }
            }
            else {
                value = '-';
            }

            // Mask NaN or empty-like values
            if (value === '-' || value.trim() === '' || value.toLowerCase() === 'nan') {
                return; // skip rendering this stat
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

function closeImageDetailModal() {
    imageDetailModal.classList.remove('visible');
    document.body.style.overflow = ''; // Restore scrolling
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


// Helper to manage visual state of active brush
function setActiveBrush(tag: string) {
    if (activeBrushTags.has(tag)) {
        activeBrushTags.delete(tag);
    } else {
        activeBrushTags.add(tag);
    }

    // Update visual state of chips
    const chips = document.querySelectorAll('.tag-chip');
    chips.forEach(chip => {
        const t = (chip as HTMLElement).dataset.tag;
        if (t && activeBrushTags.has(t)) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

}

function updateUniqueTags(tags: string[]) {
    // Filter out None, null, undefined, empty strings, and whitespace-only strings
    uniqueTags = (tags || []).filter(t => t && t.trim() !== '' && t !== 'None');

    // 1. Update existing tags datalist (for tagging modal)
    const datalist = document.getElementById('existing-tags');
    if (datalist) {
        datalist.innerHTML = uniqueTags.map(t => `<option value="${t}">`).join('');
    }

    // 2. Update Painter Mode Tag List (Chips)
    const tagsContainer = document.getElementById('painter-tags-list');
    if (tagsContainer) {
        // Preserve the inline input before clearing
        const inlineInput = tagsContainer.querySelector('.inline-tag-input');

        // Clear only the chips (avoid wiping the inline input if it exists)
        // We can do this by removing all children distinct from inlineInput
        Array.from(tagsContainer.children).forEach(child => {
            if (child !== inlineInput) {
                child.remove();
            }
        });

        if (uniqueTags.length === 0) {
            // If no tags, maybe show a small text? or just show nothing before the input
            // For now, let's just leave it clean or add a placeholder text if needed
            // tagsContainer.insertAdjacentHTML('afterbegin', '<span class="empty-text">No tags</span>');
        } else {
            // Sort tags if needed, they usually come sorted
            uniqueTags.forEach(tag => {
                const chip = document.createElement('div');
                chip.className = 'tag-chip';
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
            selectedCells.forEach(cell => {
                const gridCell = getGridCell(cell);
                if (gridCell) {
                    gridCell.updateStats({ "tags": "" });
                }
            });
            clearResponseCache();
        } else {
            alert(`Failed to remove tag: ${response.message}`);
        }
    } catch (error) {
        alert(`Error removing tag: ${error}`);
    }
}
// Helper to get origin string
function getRecordOrigin(record: any): string {
    const originStat = record.dataStats.find((s: any) => s.name === 'origin');
    return originStat?.valueString || 'train'; // default
}

async function paintCell(cell: HTMLElement) {
    // Ensure training is paused before restoring data (painter mode)
    await ensureTrainingPaused();

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
        .filter((t: string) => t && t !== 'None')));

    if (isPainterRemoveMode) {
        // REMOVE MODE: Remove any selected tags that exist
        const tagsToRemove = Array.from(activeBrushTags).filter((t: string) => currentTags.includes(t));
        if (tagsToRemove.length === 0) return;

        const newTags = currentTags.filter((t: string) => !tagsToRemove.includes(t));
        const newTagsStr = newTags.join(';');

        // Optimistic update
        gridCell.updateStats({ "tags": newTagsStr });


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

// Expose checkpoint restore functions to window for HTML onclick handlers
(window ).closeRestoreMarkerModal = closeRestoreMarkerModal;
(window ).executeRestoreCheckpoint = executeRestoreCheckpoint;
