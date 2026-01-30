/**
 * Grid Data Manager
 * Handles grid data fetching, caching, display, and pagination via slider
 */

import { DataSamplesRequest, DataSamplesResponse } from "../proto/experiment_service";

export interface GridSettings {
    cellSize: number;
    zoom: number;
    imageResolutionAuto: boolean;
    imageResolutionPercent: number;
}

const MAX_PREFETCH_BATCHES = (() => {
    const available = (navigator as any).deviceMemory || 4; // GB
    return Math.max(2, Math.min(6, Math.floor(available / 2)));
})();

const MAX_CACHE_ENTRIES = MAX_PREFETCH_BATCHES + 4;
const DEBOUNCE_DELAY_MS = 300;

let prefetchInProgress = false;
let lastFetchedBatchStart: number = 0;
let currentFetchRequestId = 0;
let fetchTimeout: any = null;

// Response cache with LRU eviction
const responseCache = new Map<string, DataSamplesResponse>();
const cacheAccessOrder: string[] = [];

export function saveGridSettings(): void {
    const cellSizeInput = document.getElementById('cell-size') as HTMLInputElement;
    const zoomLevelInput = document.getElementById('zoom-level') as HTMLInputElement;
    const imageResolutionAutoInput = document.getElementById('image-resolution-auto') as HTMLInputElement;
    const imageResolutionPercentInput = document.getElementById('image-resolution-percent') as HTMLInputElement;

    if (cellSizeInput) localStorage.setItem('grid-cell-size', cellSizeInput.value);
    if (zoomLevelInput) localStorage.setItem('grid-zoom-level', zoomLevelInput.value);
    if (imageResolutionAutoInput) localStorage.setItem('grid-image-resolution-auto', imageResolutionAutoInput.checked.toString());
    if (imageResolutionPercentInput) localStorage.setItem('grid-image-resolution-percent', imageResolutionPercentInput.value);
}

export function restoreGridSettings(): void {
    const cellSizeInput = document.getElementById('cell-size') as HTMLInputElement;
    const cellSizeValue = document.getElementById('cell-size-value') as HTMLElement;
    const zoomLevelInput = document.getElementById('zoom-level') as HTMLInputElement;
    const zoomValue = document.getElementById('zoom-value') as HTMLElement;
    const imageResolutionAutoInput = document.getElementById('image-resolution-auto') as HTMLInputElement;
    const imageResolutionPercentInput = document.getElementById('image-resolution-percent') as HTMLInputElement;
    const imageResolutionValue = document.getElementById('image-resolution-value') as HTMLSpanElement;

    const cachedSettings = (window as any).__cachedGridSettings || {};
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

    if (imageResolutionAutoInput) {
        imageResolutionAutoInput.checked = savedImageResolutionAuto === 'true' || !savedImageResolutionAuto;
    }

    if (imageResolutionPercentInput && imageResolutionValue) {
        if (imageResolutionAutoInput?.checked) {
            imageResolutionValue.textContent = 'Auto';
        } else if (savedImageResolutionPercent) {
            imageResolutionPercentInput.value = savedImageResolutionPercent;
            imageResolutionValue.textContent = `${savedImageResolutionPercent}%`;
        }
    }
}

function getCacheKey(start: number, count: number, resizeWidth: number, resizeHeight: number): string {
    return `${start}-${count}-${resizeWidth}-${resizeHeight}`;
}

export function getCachedResponse(start: number, count: number, resizeWidth: number, resizeHeight: number): DataSamplesResponse | null {
    const key = getCacheKey(start, count, resizeWidth, resizeHeight);
    const cached = responseCache.get(key);
    if (cached) {
        // Move to end (most recently used)
        cacheAccessOrder.splice(cacheAccessOrder.indexOf(key), 1);
        cacheAccessOrder.push(key);
    }
    return cached || null;
}

export function setCachedResponse(start: number, count: number, resizeWidth: number, resizeHeight: number, response: DataSamplesResponse): void {
    const key = getCacheKey(start, count, resizeWidth, resizeHeight);
    responseCache.set(key, response);
    cacheAccessOrder.push(key);

    // LRU eviction
    if (cacheAccessOrder.length > MAX_CACHE_ENTRIES) {
        const oldest = cacheAccessOrder.shift();
        if (oldest) responseCache.delete(oldest);
    }
}

export function clearResponseCache(): void {
    responseCache.clear();
    cacheAccessOrder.length = 0;
}

export function resetFetchState(): void {
    prefetchInProgress = false;
    lastFetchedBatchStart = 0;
    currentFetchRequestId++;
    if (fetchTimeout) clearTimeout(fetchTimeout);
}

export function getFetchRequestId(): number {
    return currentFetchRequestId;
}

export function incrementFetchRequestId(): number {
    return ++currentFetchRequestId;
}

export function isPrefetchInProgress(): boolean {
    return prefetchInProgress;
}

export function setPrefetchInProgress(inProgress: boolean): void {
    prefetchInProgress = inProgress;
}

export function getLastFetchedBatchStart(): number {
    return lastFetchedBatchStart;
}

export function setLastFetchedBatchStart(start: number): void {
    lastFetchedBatchStart = start;
}

export function getMaxPrefetchBatches(): number {
    return MAX_PREFETCH_BATCHES;
}

export function setFetchTimeout(timeout: any): void {
    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = timeout;
}

export function getDebounceDelay(): number {
    return DEBOUNCE_DELAY_MS;
}

// Branch Color Persistence
export function saveBranchColor(experimentHash: string | undefined, color: string): void {
    if (!experimentHash) return;
    try {
        localStorage.setItem(`branch_color_${experimentHash}`, color);
    } catch (e) {
        console.warn('Failed to save branch color:', e);
    }
}

export function loadBranchColor(experimentHash: string | undefined): string | undefined {
    if (!experimentHash) return undefined;
    try {
        return localStorage.getItem(`branch_color_${experimentHash}`) || undefined;
    } catch (e) {
        console.warn('Failed to load branch color:', e);
        return undefined;
    }
}

// --- Split Color Management ---
let availableSplits: string[] = ['train', 'eval'];

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

    // Convert HSL to hex for color input compatibility
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getSplitColors(): any {
    const colors: any = {};

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

export function getAvailableSplits(): string[] {
    return availableSplits;
}

export function setAvailableSplits(splits: string[]): void {
    availableSplits = splits;
}
// --- Data Fetching and Display ---
// These will be filled in from main.ts to avoid circular dependencies
// They are exported as public functions for external calling

export let externalFetchSamples: ((request: DataSamplesRequest) => Promise<DataSamplesResponse>) | null = null;
export let externalUpdateDisplayOnly: (() => Promise<void>) | null = null;
export let externalGridManager: any = null;
export let externalTraversalPanel: any = null;
export let externalDisplayOptionsPanel: any = null;
export let externalDatasetInfoReady: (() => boolean) | null = null;
export let externalLocallyDiscardedSampleIds: Set<number> | null = null;
export let externalLocallyRestoredSampleIds: Set<number> | null = null;

export function registerFetchDependencies(
    fetchSamples: (request: DataSamplesRequest) => Promise<DataSamplesResponse>,
    updateDisplayOnly: () => Promise<void>,
    gridManager: any,
    traversalPanel: any,
    displayOptionsPanel: any,
    datasetInfoReady: () => boolean,
    locallyDiscardedSampleIds: Set<number>,
    locallyRestoredSampleIds: Set<number>
): void {
    externalFetchSamples = fetchSamples;
    externalUpdateDisplayOnly = updateDisplayOnly;
    externalGridManager = gridManager;
    externalTraversalPanel = traversalPanel;
    externalDisplayOptionsPanel = displayOptionsPanel;
    externalDatasetInfoReady = datasetInfoReady;
    externalLocallyDiscardedSampleIds = locallyDiscardedSampleIds;
    externalLocallyRestoredSampleIds = locallyRestoredSampleIds;
}

export async function fetchAndDisplaySamples() {
    if (!externalDatasetInfoReady || !externalDatasetInfoReady()) {
        console.debug('[fetchAndDisplaySamples] Dataset info not ready; skipping initial fetch.');
        return;
    }
    if (!externalDisplayOptionsPanel) {
        console.warn('displayOptionsPanel not initialized');
        return;
    }
    console.debug('[Fetch Samples] Starting fetch and display of samples at ' + new Date().toISOString() + '...');

    const startRaw = externalTraversalPanel.getStartIndex();
    const countRaw = externalTraversalPanel.getLeftSamples();
    const start = Number.isFinite(Number(startRaw)) ? Number(startRaw) : 0;
    const requestedCount = Number.isFinite(Number(countRaw)) ? Number(countRaw) : 0;
    const gridCount = externalGridManager.calculateGridDimensions().gridCount;
    const count = Math.min(requestedCount, gridCount);

    if (count <= 0) {
        console.debug('[Fetch Samples] count <= 0, aborting fetch');
        return;
    }
    const batchSize = Math.min(externalGridManager.calculateGridDimensions().gridCount, 128);

    const requestId = incrementFetchRequestId();

    // Get resolution settings once
    const resolutionPercent = externalTraversalPanel.getImageResolutionPercent();
    let resizeWidth = 0;
    let resizeHeight = 0;

    if (resolutionPercent > 0 && resolutionPercent <= 100) {
        resizeWidth = -resolutionPercent;
        resizeHeight = -resolutionPercent;
    } else {
        const { cellWidth, cellHeight } = externalGridManager.calculateGridDimensions();
        resizeWidth = cellWidth;
        resizeHeight = cellHeight;
    }

    // Check cache first for the entire batch
    const cachedResponse = getCachedResponse(start, count, resizeWidth, resizeHeight);
    if (cachedResponse && cachedResponse.success && cachedResponse.dataRecords.length > 0) {
        // Display from cache
        const preferences = externalDisplayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();
        cachedResponse.dataRecords.forEach((record, index) => {
            // Apply locally-tracked discard state to maintain consistency across refreshes
            const denyListedStat = record.dataStats.find(stat => stat.name === 'deny_listed');
            if (denyListedStat) {
                if (externalLocallyDiscardedSampleIds!.has(record.sampleId)) {
                    denyListedStat.value = [1];
                    denyListedStat.valueString = '1';
                } else if (externalLocallyRestoredSampleIds!.has(record.sampleId)) {
                    denyListedStat.value = [0];
                    denyListedStat.valueString = '0';
                }
            }

            const cell = externalGridManager.getCellbyIndex(index);
            if (cell) {
                cell.populate(record, preferences);
            }
        });
        console.debug(`[Cache] Displayed ${cachedResponse.dataRecords.length} cached records`);

        // Update range labels on scrollbar
        externalTraversalPanel.updateRangeLabels();

        // Keep left metadata panel in sync with the latest records (even if cached)
        externalDisplayOptionsPanel.populateOptions(cachedResponse.dataRecords);

        // Trigger prefetch of multiple batches ahead in background
        await prefetchMultipleBatches(start, count, resizeWidth, resizeHeight);
        return;
    }

    try {
        let totalRecordsRetrieved = 0;
        const allRecords: any[] = [];

        for (let i = 0; i < count; i += batchSize) {
            if (requestId !== getFetchRequestId()) {
                console.debug(`Discarding obsolete fetch request ${requestId}, current is ${getFetchRequestId()}`);
                return;
            }

            const maxStartIndex = Math.max(0, externalTraversalPanel.getMaxSampleId() - count + 1);
            if (start > maxStartIndex) {
                console.debug(`Start index ${start} exceeds max ${maxStartIndex}, aborting fetch`);
                return;
            }

            const currentBatchSize = Math.min(batchSize, count - i);
            const resolutionPercent = externalTraversalPanel.getImageResolutionPercent();
            let resizeWidth = 0;
            let resizeHeight = 0;

            if (resolutionPercent > 0 && resolutionPercent <= 100) {
                resizeWidth = -resolutionPercent;
                resizeHeight = -resolutionPercent;
            } else {
                const { cellWidth, cellHeight } = externalGridManager.calculateGridDimensions();
                resizeWidth = cellWidth;
                resizeHeight = cellHeight;
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

            const response = await externalFetchSamples!(request);

            if (requestId !== getFetchRequestId()) {
                console.debug(`Discarding obsolete batch ${i}, current request is ${getFetchRequestId()}`);
                return;
            }

            if (response.success && response.dataRecords.length > 0) {
                console.log('First received data record:', response.dataRecords[0]);
                const preferences = externalDisplayOptionsPanel.getDisplayPreferences();
                preferences.splitColors = getSplitColors();
                response.dataRecords.forEach((record, index) => {
                    const denyListedStat = record.dataStats.find(stat => stat.name === 'deny_listed');
                    if (denyListedStat) {
                        if (externalLocallyDiscardedSampleIds!.has(record.sampleId)) {
                            denyListedStat.value = [1];
                            denyListedStat.valueString = '1';
                        } else if (externalLocallyRestoredSampleIds!.has(record.sampleId)) {
                            denyListedStat.value = [0];
                            denyListedStat.valueString = '0';
                        }
                    }

                    const cellIndex = totalRecordsRetrieved + index;
                    const cell = externalGridManager.getCellbyIndex(cellIndex);
                    if (cell) {
                        cell.populate(record, preferences);
                    } else {
                        console.warn(`Cell at index ${cellIndex} not found`);
                    }
                });

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

        // Detect and apply aspect ratio from the first batch of results
        if (allRecords.length > 0) {
            const firstRecord = allRecords[0];
            const rawStat = firstRecord.dataStats.find((s: any) => s.name === 'raw_data' || s.name === 'image');
            if (rawStat && rawStat.shape && rawStat.shape.length >= 2) {
                const h = rawStat.shape[0];
                const w = rawStat.shape[1];
                if (h > 0 && w > 0) {
                    const ratio = w / h;
                    if (externalGridManager.setAspectRatio(ratio)) {
                        console.info(`[Aspect Ratio] Detected new ratio: ${ratio.toFixed(2)}. Re-triggering layout.`);
                        await updateLayout();
                    }
                }
            }
        }

        // Cache the complete response
        if (allRecords.length > 0) {
            const completeResponse: DataSamplesResponse = {
                success: true,
                message: '',
                dataRecords: allRecords
            };
            setCachedResponse(start, count, resizeWidth, resizeHeight, completeResponse);
            if (externalDisplayOptionsPanel) {
                externalDisplayOptionsPanel.populateOptions(allRecords);
            }
        }

        // Update range labels on scrollbar
        externalTraversalPanel.updateRangeLabels();

        // Trigger prefetch of batches both ahead and behind based on navigation direction
        await prefetchBidirectionalBatches(start, count, resizeWidth, resizeHeight, getLastFetchedBatchStart());
        setLastFetchedBatchStart(start);

    } catch (error) {
        console.debug("fetchAndDisplaySamples failed. See error above.");
    }
}

export async function prefetchBidirectionalBatches(currentStart: number, count: number, resizeWidth: number, resizeHeight: number, lastStart: number = 0, totalBatches: number = MAX_PREFETCH_BATCHES): Promise<void> {
    if (isPrefetchInProgress()) {
        console.debug('[Prefetch] Already in progress, skipping');
        return;
    }
    console.debug('[PrefetchBi] Starting prefetch of batches...');

    setPrefetchInProgress(true);
    const maxSampleId = externalTraversalPanel.getMaxSampleId();
    const batchesToPrefetch: number[] = [];

    const maxBackwardBatches = Math.floor(currentStart / count);
    const maxForwardBatches = Math.floor((maxSampleId - currentStart) / count);

    let targetForward = Math.ceil(totalBatches * 2 / 3);
    let targetBackward = Math.floor(totalBatches * 1 / 3);

    if (totalBatches === 1) {
        if (maxForwardBatches > 0) {
            targetForward = 1;
            targetBackward = 0;
        } else if (maxBackwardBatches > 0) {
            targetForward = 0;
            targetBackward = 1;
        }
    }

    const availableBackward = Math.min(targetBackward, maxBackwardBatches);
    const availableForward = Math.min(targetForward, maxForwardBatches);

    if (availableBackward < targetBackward && availableForward < maxForwardBatches) {
        targetForward = Math.min(totalBatches - availableBackward, maxForwardBatches);
    } else if (availableForward < targetForward && availableBackward < maxBackwardBatches) {
        targetBackward = Math.min(totalBatches - availableForward, maxBackwardBatches);
    }

    console.debug(`[Prefetch] Position: ${currentStart}, Direction: forward=${availableForward}/${targetForward} backward=${availableBackward}/${targetBackward}`);

    for (let i = 1; i <= targetBackward; i++) {
        const batchStart = currentStart - (count * i);
        if (batchStart < 0) break;
        const cached = getCachedResponse(batchStart, count, resizeWidth, resizeHeight);
        if (!cached) {
            batchesToPrefetch.push(batchStart);
            console.debug('[Prefetch] Adding backward batch at', batchStart);
        }
    }

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
        setPrefetchInProgress(false);
        return;
    }

    console.debug(`[Prefetch] Loading ${batchesToPrefetch.length} batches: ${batchesToPrefetch.join(', ')}`);

    try {
        const batchSize = Math.min(externalGridManager.calculateGridDimensions().gridCount, 128);

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

                const response = await externalFetchSamples!(request);

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
        setPrefetchInProgress(false);
    }
}

export async function prefetchMultipleBatches(currentStart: number, count: number, resizeWidth: number, resizeHeight: number, batchesAhead: number = MAX_PREFETCH_BATCHES): Promise<void> {
    if (isPrefetchInProgress()) {
        console.debug('[Prefetch] Already in progress, skipping');
        return;
    }
    console.debug('[PrefetchMul] Starting prefetch of batches...');

    setPrefetchInProgress(true);
    const maxSampleId = externalTraversalPanel.getMaxSampleId();
    const batchesToPrefetch: number[] = [];

    for (let i = 1; i <= batchesAhead; i++) {
        const batchStart = currentStart + (count * i);
        if (batchStart > maxSampleId) {
            console.debug(`[Prefetch] Batch ${batchStart} exceeds max sample ID ${maxSampleId}, stopping`);
            break;
        }

        const cached = getCachedResponse(batchStart, count, resizeWidth, resizeHeight);
        if (!cached) {
            batchesToPrefetch.push(batchStart);
            console.debug('[Prefetch] Adding in cache batch starting at', batchStart);
        }
    }

    if (batchesToPrefetch.length === 0) {
        console.debug('[Prefetch] All upcoming batches already cached or at end of dataset');
        setPrefetchInProgress(false);
        return;
    }

    console.debug(`[Prefetch] Loading ${batchesToPrefetch.length} batches ahead: ${batchesToPrefetch.join(', ')}`);

    try {
        const batchSize = Math.min(externalGridManager.calculateGridDimensions().gridCount, 128);

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

                const response = await externalFetchSamples!(request);

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
        setPrefetchInProgress(false);
    }
}

export function debouncedFetchAndDisplay(callback: () => Promise<void>): void {
    if (fetchTimeout) {
        clearTimeout(fetchTimeout);
    }
    fetchTimeout = setTimeout(() => {
        callback();
    }, DEBOUNCE_DELAY_MS);
}

export async function updateLayout(): Promise<void> {
    console.info('[updateLayout] Updating grid layout due to resize or cell size/zoom change.');
    if (!externalGridManager) {
        console.warn('[updateLayout] gridManager is missing.');
        return;
    }

    externalGridManager.updateGridLayout();
    const gridDims = externalGridManager.calculateGridDimensions();
    console.log(`[updateLayout] Grid dimensions: ${JSON.stringify(gridDims)}`);
    console.log(`[updateLayout] Actual cells created: ${externalGridManager.getCells().length}`);

    if (externalDisplayOptionsPanel) {
        const preferences = externalDisplayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();
        for (const cell of externalGridManager.getCells()) {
            cell.setDisplayPreferences(preferences);
        }
    }

    const actualCellCount = externalGridManager.getCells().length;
    externalTraversalPanel.updateSliderStep(actualCellCount);
    externalTraversalPanel.updateSliderTooltip();
    await fetchAndDisplaySamples();
}

export async function updateDisplayOnly(): Promise<void> {
    if (externalUpdateDisplayOnly) {
        await externalUpdateDisplayOnly();
    }
}

// Refresh grid cells with cached data without triggering callbacks
export function refreshGridDisplay(): void {
    const startRaw = externalTraversalPanel.getStartIndex();
    const countRaw = externalTraversalPanel.getLeftSamples();
    const start = Number.isFinite(Number(startRaw)) ? Number(startRaw) : 0;
    const count = Number.isFinite(Number(countRaw)) ? Number(countRaw) : 0;

    const resolutionPercent = externalTraversalPanel.getImageResolutionPercent();
    let resizeWidth = 0;
    let resizeHeight = 0;

    if (resolutionPercent > 0 && resolutionPercent <= 100) {
        resizeWidth = -resolutionPercent;
        resizeHeight = -resolutionPercent;
    } else {
        const { cellWidth, cellHeight } = externalGridManager.calculateGridDimensions();
        resizeWidth = cellWidth;
        resizeHeight = cellHeight;
    }

    const cacheKey = `${start}-${count}-${resizeWidth}-${resizeHeight}`;
    const cachedResponse = responseCache.get(cacheKey);

    if (cachedResponse && cachedResponse.dataRecords.length > 0) {
        // Re-render cells with current display preferences
        const preferences = externalDisplayOptionsPanel.getDisplayPreferences();
        preferences.splitColors = getSplitColors();

        cachedResponse.dataRecords.forEach((record, index) => {
            const cell = externalGridManager.getCellbyIndex(index);
            if (cell) {
                cell.populate(record, preferences);
            }
        });
        console.debug('[Refresh] Updated grid display with cached data');
    }
}

export async function fetchAndCreateSplitColorPickers(dataClient: any): Promise<void> {
    try {
        if (typeof (dataClient as any).getDataSplits !== 'function') {
            console.warn('GetDataSplits RPC not available on client; falling back to defaults');
            setAvailableSplits(['train', 'eval']);
            return;
        }

        const response = await dataClient.getDataSplits({}).response;

        if (response.success && Array.isArray(response.splitNames) && response.splitNames.length > 0) {
            // Filter out null, undefined, or empty split names
            const filteredSplits = response.splitNames.filter(
                (s: string | null | undefined) => s && typeof s === 'string' && s.trim() !== '' && s.toLowerCase() !== 'none'
            );

            const preferredPatterns = [
                /^train/i,
                /^val/i,
                /^test/i,
                /^eval/i,
            ];

            const sortedSplits = filteredSplits.sort((a: string, b: string) => {
                const aIdx = preferredPatterns.findIndex(p => p.test(a));
                const bIdx = preferredPatterns.findIndex(p => p.test(b));
                if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
                if (aIdx === -1) return 1;
                if (bIdx === -1) return -1;
                return aIdx - bIdx;
            });

            setAvailableSplits(sortedSplits);

            const splitColorsContainer = document.querySelector('.split-colors .row-controls');
            if (!splitColorsContainer) {
                console.warn('Split colors container not found');
                return;
            }

            splitColorsContainer.innerHTML = '';

            sortedSplits.forEach((split: string, index: number) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'color-picker-wrapper';

                const label = document.createElement('span');
                label.className = 'chip';
                label.textContent = split.charAt(0).toUpperCase() + split.slice(1);

                const input = document.createElement('input');
                input.type = 'color';
                input.id = `${split}-color`;
                input.className = 'color-picker';

                const defaultColor = generateSplitColor(split, index, sortedSplits.length);
                const lcKey = `${split.toLowerCase()}-color`;
                const savedColor = localStorage.getItem(lcKey);
                const finalColor = savedColor || defaultColor;

                if (finalColor && finalColor !== '#000000' && finalColor !== '') {
                    input.value = finalColor;
                } else {
                    input.value = defaultColor;
                }

                if (!savedColor || savedColor === '#000000' || savedColor === '') {
                    localStorage.setItem(lcKey, input.value);
                }

                input.addEventListener('input', () => {
                    localStorage.setItem(lcKey, input.value);
                    updateDisplayOnly();
                });

                wrapper.appendChild(label);
                wrapper.appendChild(input);
                splitColorsContainer.appendChild(wrapper);
            });

            console.log(`Created color pickers for splits: ${sortedSplits.join(', ')}`);
        } else {
            console.warn('No splits returned from server, using defaults');
            setAvailableSplits(['train', 'eval']);
        }
    } catch (error) {
        console.error('Failed to fetch data splits:', error);
        setAvailableSplits(['train', 'eval']);
    }
}