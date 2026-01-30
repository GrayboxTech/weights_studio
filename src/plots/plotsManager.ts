/**
 * Plots Manager
 * Handles all chart.js signal visualization, markers, and plot generation
 */

import Chart from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";


// Register zoom plugin
Chart.register(zoomPlugin);

export interface SignalRawPoint {
    x: number;
    y: number;
    experimentHash?: string;
    changeDetail?: string;
}

export interface SignalDataPoint {
    x: number;
    y: number;
}

export interface SignalBranch {
    rawPoints: SignalRawPoint[];
    branchId?: number;
    experimentHash?: string;
    customColor?: string;
}

export interface SignalChart {
    chart: Chart;
    element: HTMLElement;
    rawPoints: SignalRawPoint[];
    data: SignalDataPoint[];
    branches: SignalBranch[];
    color: string;
    markersEnabled: boolean;
    userZoomed: boolean;
    pending?: boolean;
    smoothingEnabled?: boolean;
    smoothingFactor?: number;
    stdEnabled?: boolean;
}

const signalCharts = new Map<string, SignalChart>();
let signalUpdateTimer: number | null = null;
let nextBranchId = 0; // Counter for branch IDs
const SMOOTHING_FACTOR = 0.6;
const STD_WINDOW = 20;
const SIGNAL_HISTORY_LIMIT = 50000;
const PLOT_STRIDE = 5;
const DOUBLE_CLICK_THRESHOLD_MS = 300;

let lastMarkerClickTime: number = 0;  // Double-click detection for markers
let signalsContainer: HTMLElement | null = null;
let plotRefreshEnabled = true;
let plotRefreshIntervalMs = 5000;

// External module reference (will be set by main.ts)
let gridDataManager: any = null;

export function registerGridDataManager(manager: any): void {
    gridDataManager = manager;
}

export function initializePlotsManager(): void {
    signalsContainer = document.getElementById('signals-board');
}

export function getSignalCharts(): Map<string, SignalChart> {
    return signalCharts;
}

export function getOrCreateSignalChart(signalName: string): SignalChart | null {
    const existing = getSignalChart(signalName);
    if (existing) return existing;

    const container = ensureSignalsContainer();
    if (!container) {
        console.warn('Signals container not found in DOM.');
        return null;
    }

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

    const savedColor = getColorForMetric(signalName);
    const savedMarkersEnabled = localStorage.getItem(`signal-markers-enabled-${signalName}`) !== 'false'; // Default to true

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
    canvas.style.height = '400px';
    canvas.style.display = 'block';

    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.position = 'relative';
    canvasWrapper.style.width = '100%';
    canvasWrapper.style.height = '400px';
    canvasWrapper.appendChild(canvas);

    card.appendChild(header);
    card.appendChild(canvasWrapper);
    container.appendChild(card);

    const wrapperRect = canvasWrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(wrapperRect.width));
    canvas.height = Math.max(1, Math.floor(wrapperRect.height));

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
                    pointRadius: 1,
                    pointHitRadius: 5,
                    borderWidth: 2,
                    tension: 0,
                },
                {
                    label: 'markers',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: '#ff6b6b',
                    pointStyle: 'circle',
                    pointRadius: 12,
                    pointHoverRadius: 22,
                    pointHitRadius: 5,
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
            interaction: {
                mode: 'nearest',
            },
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems: any) => {
                            const item = tooltipItems[0];
                            return signalName || 'Signal';
                        },
                        label: (tooltipItem: any) => {
                            const xValue = tooltipItem.parsed.x.toFixed(2);
                            const yValue = tooltipItem.parsed.y.toFixed(4);
                            return `Step: ${xValue}, Value: ${yValue}`;
                        }
                    },
                    filter: (tooltipItem: any) => {
                        // Don't show tooltip for markers dataset or std bands
                        if (tooltipItem.datasetIndex === 3 || tooltipItem.datasetIndex === 0 || tooltipItem.datasetIndex === 1) {
                            return false;
                        }
                        return true;
                    },
                },
                decimation: { enabled: true, algorithm: 'lttb', samples: 300 },
                zoom: {
                    zoom: {
                        wheel: { enabled: false },
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
                    title: {
                        display: true,
                        text: 'Steps',
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 10,
                        callback: (value: any) => Number(value).toFixed(0),
                    },
                    grid: { color: gridColor },
                },
                y: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Values',
                        font: { size: 12, weight: 'bold' }
                    },
                    grid: { color: gridColor },
                    grace: '5%',
                    min: 0,
                },
            },
            onHover: (event: any, activeElements: any) => {
                // Find markers dataset (last dataset)
                const markersDatasetIndex = chart.data.datasets.length - 1;

                // Completely disable and hide Chart.js tooltip
                if (chart.options.plugins?.tooltip) {
                    chart.options.plugins.tooltip.enabled = false;
                }

                // Only handle hover for markers if markers are enabled
                if (!entry.markersEnabled) {
                    (chart as any).__hoveredMarker = null;
                    chart.draw();
                    hideMarkerTooltip();
                    return;
                }

                if (activeElements && activeElements.length > 0) {
                    // Check if any element is a marker (last dataset)
                    const markerElement = activeElements.find((el: any) => el.datasetIndex === markersDatasetIndex);

                    if (markerElement) {
                        // Hovering over a marker - highlight the segment
                        const markerIndex = markerElement.index;
                        const markersDataset = chart.data.datasets[markersDatasetIndex];
                        const markers = markersDataset.data as any[];
                        const marker = markers[markerIndex];

                        console.debug('Highlighting marker', markerIndex, 'of', markers.length, 'markers');

                        // Store marker info for highlighting and click handling
                        (chart as any).__hoveredMarker = { markerIndex, marker, signalName };
                        chart.draw();

                        // Completely disable and hide Chart.js tooltip
                        if (chart.options.plugins?.tooltip) {
                            chart.options.plugins.tooltip.enabled = false;
                        }
                        // Hide any existing Chart.js tooltip element
                        const chartjsTooltip = document.querySelector('.chartjs-tooltip');
                        if (chartjsTooltip) {
                            (chartjsTooltip as HTMLElement).style.opacity = '0';
                            (chartjsTooltip as HTMLElement).style.display = 'none';
                        }

                        // Show marker details in tooltip
                        if (marker) {
                            showMarkerTooltip(marker, event.native);
                        }

                        // Store marker info for click handling
                        (chart as any).__hoveredMarker = { markerIndex, marker, signalName };

                    } else {
                        // Not hovering over a marker - clear everything
                        (chart as any).__hoveredMarker = null;
                        chart.draw();
                        hideMarkerTooltip();

                        // Re-enable Chart.js tooltip
                        if (chart.options.plugins?.tooltip) {
                            chart.options.plugins.tooltip.enabled = true;
                        }
                    }
                } else {
                    // Mouse left the chart - clear highlight
                    (chart as any).__hoveredMarker = null;
                    chart.draw();
                    hideMarkerTooltip();

                    // Re-enable Chart.js tooltip
                    if (chart.options.plugins?.tooltip) {
                        chart.options.plugins.tooltip.enabled = true;
                    }
                }
            },
            onClick: (event: any, activeElements: any) => {
                // Skip all click handling if markers are disabled
                if (!entry.markersEnabled) {
                    return;
                }

                // Detect double-click for restore modal (only on markers if enabled)
                if (!activeElements || activeElements.length === 0) {
                    return;
                }

                // Find markers dataset (last dataset)
                const markersDatasetIndex = chart.data.datasets.length - 1;

                // Check if clicked element is a marker (last dataset)
                const markerElement = activeElements.find((el: any) => el.datasetIndex === markersDatasetIndex);
                if (!markerElement) return;

                const now = Date.now();
                const isDoubleClick = now - lastMarkerClickTime < DOUBLE_CLICK_THRESHOLD_MS;
                console.debug(`Marker click: elapsed=${now - lastMarkerClickTime}ms, isDouble=${isDoubleClick}`);
                lastMarkerClickTime = now;

                if (!isDoubleClick) return;

                // Find all markers near the click point (within hit radius)
                const clickX = chart.scales.x.getValueForPixel(event.x!);
                const clickY = chart.scales.y.getValueForPixel(event.y!);
                const markersDataset = chart.data.datasets[markersDatasetIndex];
                const allMarkers = markersDataset.data as any[];

                // Get hit radius from marker configuration
                const hitRadius = (markersDataset as any).pointHitRadius || 25;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                const nearbyMarkers: any[] = [];
                allMarkers.forEach((marker, idx) => {
                    const markerXPixel = xScale.getPixelForValue(marker.x);
                    const markerYPixel = yScale.getPixelForValue(marker.y);
                    const clickXPixel = event.x!;
                    const clickYPixel = event.y!;

                    const distance = Math.sqrt(
                        Math.pow(markerXPixel - clickXPixel, 2) +
                        Math.pow(markerYPixel - clickYPixel, 2)
                    );

                    if (distance <= hitRadius) {
                        nearbyMarkers.push({ marker, index: idx });
                    }
                });

                console.debug(`Found ${nearbyMarkers.length} markers in click area`);

                if (nearbyMarkers.length === 0) return;

                if (nearbyMarkers.length === 1) {
                    // Single marker - show restore modal directly
                    showRestoreMarkerModal(nearbyMarkers[0].marker, signalName);
                } else {
                    // Multiple markers - show selection list
                    showMarkerSelectionModal(nearbyMarkers.map(nm => nm.marker), signalName);
                }

                lastMarkerClickTime = 0; // Reset after modal opens
            },
        },
        plugins: [
            {
                id: 'segmentHighlight',
                afterDatasetsDraw(chart: Chart) {
                    const ctx = chart.ctx;
                    const hoveredMarker = (chart as any).__hoveredMarker;

                    if (!hoveredMarker || !hoveredMarker.marker) return;

                    const marker = hoveredMarker.marker;
                    const markerHash = marker.experimentHash;

                    if (!markerHash) return;

                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;

                    // Find the main line dataset with matching experimentHash using metadata
                    let mainLineDataset: any = null;
                    let upperDataset: any = null;
                    let lowerDataset: any = null;

                    for (const dataset of chart.data.datasets) {
                        const ds = dataset as any;
                        if (ds._experimentHash === markerHash) {
                            if (ds._datasetType === 'main') {
                                mainLineDataset = ds;
                            } else if (ds._datasetType === 'upper') {
                                upperDataset = ds;
                            } else if (ds._datasetType === 'lower') {
                                lowerDataset = ds;
                            }
                        }
                    }

                    if (!mainLineDataset) return;

                    const mainLinePoints = mainLineDataset.data as any[];

                    // Find the branch for color
                    let targetBranch = entry.branches.find(b => b.experimentHash === markerHash);
                    if (!targetBranch) return;

                    const highlightColor = targetBranch.customColor || entry.color;

                    ctx.save();

                    // Draw highlighted main line over entire branch
                    ctx.strokeStyle = highlightColor;
                    ctx.lineWidth = 5;
                    ctx.globalAlpha = 0.9;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    ctx.beginPath();
                    for (let i = 0; i < mainLinePoints.length; i++) {
                        const p = mainLinePoints[i];
                        const xPixel = xScale.getPixelForValue(p.x);
                        const yPixel = yScale.getPixelForValue(p.y);

                        if (i === 0) {
                            ctx.moveTo(xPixel, yPixel);
                        } else {
                            ctx.lineTo(xPixel, yPixel);
                        }
                    }
                    ctx.stroke();

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

    // Add context menu for chart
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showChartContextMenu(e, chart, entry, signalName);
    });

    // Setup resize handle for horizontal dragging
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (isResizing) {
            const delta = e.clientX - startX;
            const newWidth = Math.max(300, startWidth + delta);
            card.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        chart.resize();
    });

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'signal-card-resize-handle';
    resizeHandle.title = 'Drag to resize';
    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = card.offsetWidth;
        e.preventDefault();
    });
    card.appendChild(resizeHandle);

    const entry: SignalChart = {
        chart,
        element: card,
        data: [],
        rawPoints: [], // Kept for backward compatibility
        branches: [{ rawPoints: [], branchId: nextBranchId++ }], // Initialize with first branch
        pending: false,
        color: savedColor,
        smoothingEnabled: true,
        smoothingFactor: SMOOTHING_FACTOR,
        stdEnabled: true,
        markersEnabled: savedMarkersEnabled,
        userZoomed: false,
    };

    // Store original line color for segment highlighting
    (chart as any).__originalLineColor = savedColor;

    // Add custom wheel event listener for CTRL+scroll zoom
    canvas.addEventListener('wheel', (e: WheelEvent) => {
        // Only zoom if CTRL key is pressed
        if (!e.ctrlKey) {
            return; // Allow normal page scroll
        }
        // CTRL is pressed - prevent page scroll and zoom chart
        e.preventDefault();

        const chartArea = chart.chartArea;
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        if (!chartArea || mouseX < chartArea.left || mouseX > chartArea.right || mouseY < chartArea.top || mouseY > chartArea.bottom) {
            return;
        }

        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9; // >1 zoom out, <1 zoom in

        Object.values(chart.scales).forEach((scale: any) => {
            const isHorizontal = scale.axis === 'x';
            const pixel = isHorizontal ? mouseX : mouseY;
            const center = scale.getValueForPixel(pixel);
            if (center === undefined || center === null || isNaN(center)) {
                return;
            }

            const min = scale.min;
            const max = scale.max;
            if (min === undefined || max === undefined) {
                return;
            }

            const newMin = center - (center - min) * zoomFactor;
            const newMax = center + (max - center) * zoomFactor;

            scale.options.min = newMin;
            scale.options.max = newMax;
        });

        entry.userZoomed = true;
        chart.update('none');
    }, { passive: false });

    // Store in plotsManager module
    setSignalChart(signalName, entry);
    startSignalUpdateLoop();
    return entry;
}

export function refreshSignalChart(entry: SignalChart, signalName: string, graphName?: string): void {
    const chart = entry.chart;

    // Resync entry.color from split colors or localStorage
    entry.color = getColorForMetric(signalName);

    // Clear existing datasets (except keep the structure)
    chart.data.datasets = [];

    // Collect all markers from all branches
    const allMarkers: any[] = [];

    // Process each branch and create datasets
    entry.branches.forEach((branch, branchIndex) => {
        const { smoothed, upper, lower, markers } = buildSmoothedSeries(branch.rawPoints, {
            smoothingEnabled: entry.smoothingEnabled ?? true,
            smoothingFactor: entry.smoothingFactor ?? 0.6,
            stdEnabled: entry.stdEnabled ?? false,
        });

        // Use custom color if set, otherwise use default color
        const branchColor = branch.customColor || entry.color;
        const branchAlpha = branchIndex === 0 ? 1.0 : 0.8; // Slightly transparent for later branches

        // Add std band (lower)
        chart.data.datasets.push({
            data: entry.stdEnabled ? lower : [],
            fill: false,
            borderColor: 'rgba(0,0,0,0)',
            backgroundColor: 'rgba(0,0,0,0)',
            pointRadius: 0,
            pointHoverRadius: 0,
            _branchIndex: branchIndex,
            _datasetType: 'lower',
            _experimentHash: branch.experimentHash,
        } as any);

        // Add std band (upper)
        chart.data.datasets.push({
            data: entry.stdEnabled ? upper : [],
            fill: '-1',
            borderColor: 'rgba(0,0,0,0)',
            backgroundColor: entry.stdEnabled ? hexToRgba(branchColor, 0.15 * branchAlpha) : 'rgba(0,0,0,0)',
            pointRadius: 0,
            pointHoverRadius: 0,
            _branchIndex: branchIndex,
            _datasetType: 'upper',
            _experimentHash: branch.experimentHash,
        } as any);

        // Add main line
        chart.data.datasets.push({
            data: smoothed,
            fill: false,
            borderColor: hexToRgba(branchColor, branchAlpha),
            backgroundColor: hexToRgba(branchColor, 0),
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            borderWidth: 2,
            _branchIndex: branchIndex,
            _datasetType: 'main',
            _experimentHash: branch.experimentHash,
        } as any);

        /* DISABLE BRANCHES CONNEXION TO MAKE PREVIOUS STATE RELOADING AND GENERATION CLEANER */
        // // Add connector from previous branch to this one (solid line for continuity)
        // if (branchIndex > 0 && smoothed.length > 0) {
        //     const prevBranch = entry.branches[branchIndex - 1];
        //     const prevSmoothed = buildSmoothedSeries(prevBranch.rawPoints, {
        //         smoothingEnabled: entry.smoothingEnabled ?? true,
        //         smoothingFactor: entry.smoothingFactor ?? 0.6,
        //         stdEnabled: entry.stdEnabled ?? false,
        //     }).smoothed;

        //     if (prevSmoothed.length > 0) {
        //         const lastPointOfPrev = prevSmoothed[prevSmoothed.length - 1];
        //         const firstPointOfCurrent = smoothed[0];

        //         // Connect if not going backwards in steps
        //         if (firstPointOfCurrent.x >= lastPointOfPrev.x) {
        //             // Create connector line dataset (solid line for continuity)
        //             chart.data.datasets.push({
        //                 data: [lastPointOfPrev, firstPointOfCurrent],
        //                 fill: false,
        //                 borderColor: hexToRgba(branchColor, branchAlpha * 0.6),
        //                 backgroundColor: 'rgba(0,0,0,0)',
        //                 pointRadius: 0,
        //                 pointHoverRadius: 0,
        //                 tension: 0,
        //                 borderWidth: 2,
        //             });
        //         }
        //     }
        // }

        // Collect markers from this branch with their color information
        markers.forEach(marker => {
            allMarkers.push({
                ...marker,
                branchColor: branchColor, // Store the branch color with each marker
            });
        });
    });

    // Ensure change details compare against previous marker across branches
    if (allMarkers.length > 1) {
        const markersByX = [...allMarkers].sort((a, b) => a.x - b.x);
        let lastHash: string | undefined;
        markersByX.forEach((marker) => {
            if (marker.experimentHash) {
                if (lastHash && lastHash !== marker.experimentHash) {
                    marker.changeDetail = describeHashChange(lastHash, marker.experimentHash);
                }
                lastHash = marker.experimentHash;
            }
        });
    }

    // Add single markers dataset for all branches with individual colors
    const markerColors = allMarkers.map(m => m.branchColor || entry.color);

    chart.data.datasets.push({
        data: entry.markersEnabled ? allMarkers : [],
        fill: false,
        borderColor: markerColors,
        backgroundColor: markerColors,
        pointBackgroundColor: markerColors,
        pointBorderColor: markerColors,
        pointRadius: 12,
        pointHoverRadius: 22,
        pointHitRadius: 5,
        pointStyle: 'circle',
        showLine: false,
    });

    const markersDatasetIndex = chart.data.datasets.length - 1;

    if (allMarkers.length > 0) {
        console.debug(`📍 ${signalName}: ${allMarkers.length} markers across ${entry.branches.length} branches`);
    }

    // Update tooltip to skip std bands and handle markers
    chart.options.plugins.tooltip = {
        filter: (item: any) => {
            // Skip std bands (every 3rd index starting from 0 and 1)
            const datasetIndex = item.datasetIndex;
            const isStdBand = datasetIndex % 3 === 0 || datasetIndex % 3 === 1;
            const isMarkers = datasetIndex === markersDatasetIndex;
            return !isStdBand && !isMarkers;
        },
        callbacks: {
            label: function(context: any) {
                if (context.datasetIndex === markersDatasetIndex) {
                    const marker = (chart.data.datasets[markersDatasetIndex].data as any)[context.dataIndex];
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

    // Auto-fit axes if user hasn't zoomed/panned yet
    if (!entry.userZoomed) {
        // Find max X across all branches
        let maxX = 0;
        entry.branches.forEach(branch => {
            if (branch.rawPoints.length > 0) {
                const branchMaxX = branch.rawPoints[branch.rawPoints.length - 1].x;
                if (branchMaxX > maxX) maxX = branchMaxX;
            }
        });

        // Ensure scales exist and are independent
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
        chart.options.scales.x.max = maxX > 0 ? maxX : undefined;
        chart.options.scales.y.min = 0;
        chart.options.scales.y.max = undefined;

        // Force chart redraw to fix markers-only display issue on restore
        chart.update('active');
    }

    entry.pending = true;
}

export function showChartContextMenu(event: MouseEvent, chart: Chart, entry: SignalChart, signalName: string): void {
    // Remove any existing context menu
    const existingMenu = document.getElementById('chart-context-menu');
    if (existingMenu) {
        document.body.removeChild(existingMenu);
    }

    const menu = document.createElement('div');
    menu.id = 'chart-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.style.background = 'var(--surface-color, #ffffff)';
    menu.style.border = '1px solid var(--border-subtle, rgba(209, 213, 219, 0.9))';
    menu.style.borderRadius = 'var(--radius-sm, 8px)';
    menu.style.boxShadow = 'var(--shadow-soft, 0 10px 15px rgba(15, 23, 42, 0.1))';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '160px';
    menu.style.overflow = 'hidden';

    const menuItemStyles = `
        padding: 10px 14px;
        cursor: pointer;
        font-size: 13px;
        color: var(--primary-text-color, #111827);
        background: var(--surface-color, #ffffff);
        border: none;
        width: 100%;
        text-align: left;
        transition: background-color 0.15s ease;
    `;

    // Reset All button
    const resetAllBtn = document.createElement('button');
    resetAllBtn.textContent = 'Reset All Zoom';
    resetAllBtn.style.cssText = menuItemStyles;
    resetAllBtn.onmouseover = () => {
        resetAllBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)';
    };
    resetAllBtn.onmouseout = () => {
        resetAllBtn.style.background = 'var(--surface-color, #ffffff)';
    };
    resetAllBtn.onclick = () => {
        const lastX = entry.rawPoints.length ? entry.rawPoints[entry.rawPoints.length - 1].x : undefined;
        if (!chart.options.scales) {
            chart.options.scales = {};
        }
        if (!chart.options.scales.x) {
            chart.options.scales.x = {};
        }
        if (!chart.options.scales.y) {
            chart.options.scales.y = {};
        }
        chart.options.scales.x.min = 0;
        chart.options.scales.x.max = lastX;
        chart.options.scales.y.min = 0;
        chart.options.scales.y.max = undefined;
        entry.userZoomed = false;
        chart.update('none');
        document.body.removeChild(menu);
    };

    // Reset X button
    const resetXBtn = document.createElement('button');
    resetXBtn.textContent = 'Reset X Zoom';
    resetXBtn.style.cssText = menuItemStyles;
    resetXBtn.onmouseover = () => {
        resetXBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)';
    };
    resetXBtn.onmouseout = () => {
        resetXBtn.style.background = 'var(--surface-color, #ffffff)';
    };
    resetXBtn.onclick = () => {
        const lastX = entry.rawPoints.length ? entry.rawPoints[entry.rawPoints.length - 1].x : undefined;
        if (!chart.options.scales) {
            chart.options.scales = {};
        }
        if (!chart.options.scales.x) {
            chart.options.scales.x = {};
        }
        chart.options.scales.x.min = 0;
        chart.options.scales.x.max = lastX;
        entry.userZoomed = false;
        chart.update('none');
        document.body.removeChild(menu);
    };

    // Reset Y button
    const resetYBtn = document.createElement('button');
    resetYBtn.textContent = 'Reset Y Zoom';
    resetYBtn.style.cssText = menuItemStyles;
    resetYBtn.onmouseover = () => {
        resetYBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)';
    };
    resetYBtn.onmouseout = () => {
        resetYBtn.style.background = 'var(--surface-color, #ffffff)';
    };
    resetYBtn.onclick = () => {
        if (!chart.options.scales) {
            chart.options.scales = {};
        }
        if (!chart.options.scales.y) {
            chart.options.scales.y = {};
        }
        chart.options.scales.y.min = 0;
        chart.options.scales.y.max = undefined;
        entry.userZoomed = false;
        chart.update('none');
        document.body.removeChild(menu);
    };

    // Separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.background = 'var(--border-subtle, rgba(209, 213, 219, 0.9))';
    separator.style.margin = '4px 0';

    // Change Color button (only show if cursor is over a curve)
    const elements = chart.getElementsAtEventForMode(event as any, 'nearest', { intersect: false }, false);
    let colorBtn: HTMLButtonElement | null = null;

    if (elements.length > 0) {
        const clickedElement = elements[0];
        const datasetIndex = clickedElement.datasetIndex;
        const markersDatasetIndex = chart.data.datasets.length - 1;

        // Only show color picker if NOT clicked on markers
        if (datasetIndex !== markersDatasetIndex) {
            const branchIndex = Math.floor(datasetIndex / 3);

            if (branchIndex >= 0 && branchIndex < entry.branches.length) {
                const branch = entry.branches[branchIndex];

                colorBtn = document.createElement('button');
                colorBtn.textContent = `Change Curve Color (Branch ${branchIndex + 1})`;
                colorBtn.style.cssText = menuItemStyles;
                colorBtn.onmouseover = () => {
                    colorBtn!.style.background = 'var(--surface-elevated-color, #f5f5f5)';
                };
                colorBtn.onmouseout = () => {
                    colorBtn!.style.background = 'var(--surface-color, #ffffff)';
                };
                colorBtn.onclick = () => {
                    // Close menu first
                    if (menu.parentNode) {
                        menu.parentNode.removeChild(menu);
                    }

                    // Create color picker positioned at mouse click
                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.value = branch.customColor || entry.color;
                    colorInput.style.position = 'fixed';
                    colorInput.style.left = `${event.pageX}px`;
                    colorInput.style.top = `${event.pageY}px`;
                    colorInput.style.zIndex = '10001';
                    document.body.appendChild(colorInput);

                    colorInput.addEventListener('change', () => {
                        const newColor = colorInput.value;
                        branch.customColor = newColor;

                        // Save color to localStorage by hash
                        gridDataManager.saveBranchColor(branch.experimentHash, newColor);

                        // Directly update chart colors without full refresh
                        const lowerDatasetIndex = branchIndex * 3;
                        const upperDatasetIndex = branchIndex * 3 + 1;
                        const mainLineDatasetIndex = branchIndex * 3 + 2;

                        // Update std bands
                        if (chart.data.datasets[upperDatasetIndex]) {
                            chart.data.datasets[upperDatasetIndex].backgroundColor = hexToRgba(newColor, 0.15);
                        }

                        // Update main line
                        if (chart.data.datasets[mainLineDatasetIndex]) {
                            chart.data.datasets[mainLineDatasetIndex].borderColor = newColor;
                        }

                        // Update markers that belong to this branch
                        const markersDataset = chart.data.datasets[markersDatasetIndex];
                        if (markersDataset && markersDataset.data) {
                            const markers = markersDataset.data as any[];
                            const branchHash = branch.experimentHash;

                            // Update point colors for markers matching this branch's hash
                            const bgColors = markersDataset.pointBackgroundColor as any[];
                            const borderColors = markersDataset.pointBorderColor as any[];

                            if (bgColors && borderColors) {
                                markers.forEach((marker, idx) => {
                                    if (marker.experimentHash === branchHash) {
                                        bgColors[idx] = newColor;
                                        borderColors[idx] = newColor;
                                    }
                                });
                            }
                        }

                        // Update chart without full refresh
                        chart.update('none');

                        // Safe removal
                        if (colorInput.parentNode) {
                            colorInput.parentNode.removeChild(colorInput);
                        }
                    });

                    colorInput.addEventListener('cancel', () => {
                        // Safe removal
                        if (colorInput.parentNode) {
                            colorInput.parentNode.removeChild(colorInput);
                        }
                    });

                    colorInput.addEventListener('blur', () => {
                        // Safe removal when color picker loses focus
                        setTimeout(() => {
                            if (colorInput.parentNode) {
                                colorInput.parentNode.removeChild(colorInput);
                            }
                        }, 100);
                    });

                    // Trigger color picker after a small delay
                    setTimeout(() => {
                        colorInput.click();
                    }, 50);
                };
            }
        }
    }

    const separator2 = document.createElement('div');
    separator2.style.height = '1px';
    separator2.style.background = 'var(--border-subtle, rgba(209, 213, 219, 0.9))';
    separator2.style.margin = '4px 0';

    // Copy Chart as Image
    const copyImageBtn = document.createElement('button');
    copyImageBtn.textContent = 'Copy Chart as Image';
    copyImageBtn.style.cssText = menuItemStyles;
    copyImageBtn.onmouseover = () => {
        copyImageBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)';
    };
    copyImageBtn.onmouseout = () => {
        copyImageBtn.style.background = 'var(--surface-color, #ffffff)';
    };
    copyImageBtn.onclick = async () => {
        try {
            const canvas = chart.canvas;
            canvas.toBlob(async (blob: any) => {
                if (blob) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    console.log('✓ Chart copied to clipboard');
                }
            });
        } catch (err) {
            console.error('Failed to copy chart:', err);
        }
        document.body.removeChild(menu);
    };

    // Save Chart as Image
    const saveImageBtn = document.createElement('button');
    saveImageBtn.textContent = 'Save Chart as Image';
    saveImageBtn.style.cssText = menuItemStyles;
    saveImageBtn.onmouseover = () => {
        saveImageBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)';
    };
    saveImageBtn.onmouseout = () => {
        saveImageBtn.style.background = 'var(--surface-color, #ffffff)';
    };
    saveImageBtn.onclick = () => {
        const canvas = chart.canvas;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${signalName}_chart.png`;
        link.href = url;
        link.click();
        console.log(`✓ Chart saved as ${signalName}_chart.png`);
        document.body.removeChild(menu);
    };

    // Add btns to right click menu
    menu.appendChild(resetAllBtn);
    menu.appendChild(resetXBtn);
    menu.appendChild(resetYBtn);
    menu.appendChild(separator);
    if (colorBtn) {
        menu.appendChild(colorBtn);
        menu.appendChild(separator2);
    }
    menu.appendChild(copyImageBtn);
    menu.appendChild(saveImageBtn);
    document.body.appendChild(menu);

    // Close menu when clicking outside
    const closeMenuListener = (e: any) => {
        if (e.target !== menu && !menu.contains(e.target)) {
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
            document.removeEventListener('click', closeMenuListener);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenuListener);
    }, 0);
}

export function openSignalSettings(signalName: string): void {
    const entry = getSignalChart(signalName);
    if (!entry) return;

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(15, 23, 42, 0.35)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.background = 'var(--surface-color, #ffffff)';
    modal.style.color = 'var(--primary-text-color, #111827)';
    modal.style.padding = '24px';
    modal.style.borderRadius = 'var(--radius-md, 12px)';
    modal.style.minWidth = '380px';
    modal.style.maxWidth = '480px';
    modal.style.border = '1px solid var(--border-color, #d1d5db)';
    modal.style.boxShadow = 'var(--shadow-soft, 0 18px 45px rgba(15, 23, 42, 0.08))';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.gap = '16px';

    const title = document.createElement('div');
    title.textContent = `Settings • ${signalName}`;
    title.style.fontWeight = '600';
    title.style.fontSize = '18px';
    title.style.color = 'var(--primary-text-color, #111827)';
    title.style.paddingBottom = '12px';
    title.style.borderBottom = '1px solid var(--border-subtle, rgba(209, 213, 219, 0.9))';
    modal.appendChild(title);

    const colorRow = document.createElement('div');
    colorRow.style.display = 'flex';
    colorRow.style.alignItems = 'center';
    colorRow.style.justifyContent = 'space-between';
    colorRow.style.gap = '12px';
    const colorLabel = document.createElement('span');
    colorLabel.textContent = 'Curve color';
    colorLabel.style.fontSize = '14px';
    colorLabel.style.color = 'var(--primary-text-color, #111827)';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = entry.color;
    colorInput.style.width = '44px';
    colorInput.style.height = '44px';
    colorInput.style.borderRadius = '50%';
    colorInput.style.border = 'none';
    colorInput.style.cursor = 'pointer';
    colorInput.style.padding = '0';
    colorInput.style.background = 'none';
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
    smoothingToggle.checked = entry.smoothingEnabled ?? false;
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
    factorInput.value = (entry.smoothingFactor ?? 0).toString();
    factorInput.style.flex = '1';
    const factorVal = document.createElement('span');
    factorVal.textContent = (entry.smoothingFactor ?? 0).toFixed(2);
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
    stdToggle.checked = entry.stdEnabled ?? false;
    stdRow.appendChild(stdLabel);
    stdRow.appendChild(stdToggle);
    modal.appendChild(stdRow);

    const markersRow = document.createElement('div');
    markersRow.style.display = 'flex';
    markersRow.style.alignItems = 'center';
    markersRow.style.justifyContent = 'space-between';
    const markersLabel = document.createElement('span');
    markersLabel.textContent = 'Show markers';
    const markersToggle = document.createElement('input');
    markersToggle.type = 'checkbox';
    markersToggle.checked = entry.markersEnabled;
    markersRow.appendChild(markersLabel);
    markersRow.appendChild(markersToggle);
    modal.appendChild(markersRow);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.gap = '8px';
    actionsRow.style.justifyContent = 'flex-end';
    actionsRow.style.marginTop = '12px';
    actionsRow.style.paddingTop = '16px';
    actionsRow.style.borderTop = '1px solid var(--border-subtle, rgba(209, 213, 219, 0.9))';

    const buttonStyles = `
        padding: 8px 16px;
        border-radius: var(--radius-sm, 8px);
        cursor: pointer;
        font-weight: 500;
        font-size: 13px;
        transition: all 0.2s ease;
        border: none;
    `;

    const resetXBtn = document.createElement('button');
    resetXBtn.textContent = 'Reset X';
    resetXBtn.style.cssText = buttonStyles + `
        background: var(--surface-elevated-color, #f5f5f5);
        color: var(--primary-text-color, #111827);
        border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));
    `;
    resetXBtn.onmouseover = () => { resetXBtn.style.background = 'var(--border-subtle, rgba(209, 213, 219, 0.3))'; };
    resetXBtn.onmouseout = () => { resetXBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)'; };
    resetXBtn.onclick = () => {
        const lastX = entry.rawPoints.length ? entry.rawPoints[entry.rawPoints.length - 1].x : undefined;
        entry.chart.options.scales!.x!.min = 0;
        entry.chart.options.scales!.x!.max = lastX;
        entry.userZoomed = false;
        entry.chart.update('none');
    };

    const resetYBtn = document.createElement('button');
    resetYBtn.textContent = 'Reset Y to 0';
    resetYBtn.style.cssText = buttonStyles + `
        background: var(--surface-elevated-color, #f5f5f5);
        color: var(--primary-text-color, #111827);
        border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));
    `;
    resetYBtn.onmouseover = () => { resetYBtn.style.background = 'var(--border-subtle, rgba(209, 213, 219, 0.3))'; };
    resetYBtn.onmouseout = () => { resetYBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)'; };
    resetYBtn.onclick = () => {
        entry.chart.options.scales!.y!.min = 0;
        entry.chart.options.scales!.y!.max = undefined;
        entry.userZoomed = false;
        entry.chart.update('none');
    };

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = buttonStyles + `
        background: var(--accent-color, #007aff);
        color: white;
    `;
    applyBtn.onmouseover = () => { applyBtn.style.background = 'var(--accent-color-hover, #0060d0)'; };
    applyBtn.onmouseout = () => { applyBtn.style.background = 'var(--accent-color, #007aff)'; };
    applyBtn.onclick = () => {
        entry.color = colorInput.value;
        entry.smoothingEnabled = smoothingToggle.checked;
        entry.smoothingFactor = parseFloat(factorInput.value);
        entry.stdEnabled = stdToggle.checked;
        entry.markersEnabled = markersToggle.checked;
        localStorage.setItem(`signal-color-${signalName}`, entry.color);
        localStorage.setItem(`signal-markers-enabled-${signalName}`, entry.markersEnabled.toString());

        refreshSignalChart(entry, signalName);
        entry.userZoomed = false;
        entry.chart.update('none');
        document.body.removeChild(overlay);
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = buttonStyles + `
        background: var(--surface-elevated-color, #f5f5f5);
        color: var(--primary-text-color, #111827);
        border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));
    `;
    closeBtn.onmouseover = () => { closeBtn.style.background = 'var(--border-subtle, rgba(209, 213, 219, 0.3))'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = 'var(--surface-elevated-color, #f5f5f5)'; };
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

export function exportSignalDataCSV(signalName: string, data: SignalPoint[]): void {
    const csv = ['model_age,signal_value'];
    data.forEach(point => {
        csv.push(`${point.x},${point.y}`);
    });
    const csvContent = csv.join('\n');
    downloadFile(csvContent, `${signalName}.csv`, 'text/csv');
}

export function exportSignalDataJSON(signalName: string, data: SignalPoint[]): void {
    const json = {
        signal_name: signalName,
        timestamp: new Date().toISOString(),
        points: data,
    };
    const jsonContent = JSON.stringify(json, null, 2);
    downloadFile(jsonContent, `${signalName}.json`, 'application/json');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
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

export function setPlotRefreshInterval(ms: number): void {
    plotRefreshIntervalMs = ms;
}

export function getSignalsContainer(): HTMLElement | null {
    return signalsContainer;
}

export function startSignalUpdateLoop(): void {
    if (signalUpdateTimer !== null) clearInterval(signalUpdateTimer);
    signalUpdateTimer = window.setInterval(() => {
        if (!plotRefreshEnabled) return;
        for (const [_, entry] of signalCharts.entries()) {
            if (entry.chart && !entry.userZoomed) {
                entry.chart.update('none');
            }
        }
    }, plotRefreshIntervalMs);
}

export function stopSignalUpdateLoop(): void {
    if (signalUpdateTimer !== null) {
        clearInterval(signalUpdateTimer);
        signalUpdateTimer = null;
    }
}

export function pushSignalSample(signalName: string, modelAge: number, value: number): void {
    const entry = signalCharts.get(signalName);
    if (!entry) return;

    const newPoint: SignalRawPoint = { x: modelAge, y: value };
    entry.rawPoints.push(newPoint);

    // Keep history to limit
    if (entry.rawPoints.length > SIGNAL_HISTORY_LIMIT) {
        entry.rawPoints.splice(0, entry.rawPoints.length - SIGNAL_HISTORY_LIMIT);
    }
}

export function clearSignalCharts(): void {
    signalCharts.forEach(entry => {
        entry.chart.destroy();
    });
    signalCharts.clear();
}

export function getSignalChart(signalName: string): SignalChart | null {
    return signalCharts.get(signalName) || null;
}

export function setSignalChart(signalName: string, chart: SignalChart): void {
    signalCharts.set(signalName, chart);
}

export function getColorForMetric(name: string): string {
    const saved = localStorage.getItem(`signal-color-${name}`);
    if (saved) return saved;

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    const hash = Array.from(name).reduce((h, c) => h + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

export function saveSignalColor(signalName: string, color: string): void {
    localStorage.setItem(`signal-color-${signalName}`, color);
}

// UI Utility Functions
export function readCssVar(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
}

export function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return hex;
    const num = parseInt(normalized, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function triangleColor(): string {
    return isDarkMode() ? '#ffffff' : '#000000';
}

// Signals Board Management
export function initSignalsBoard(): void {
    const signalsContainer = document.getElementById('signals-board') as HTMLElement | null;

    // Add header with global plot settings button if not already added
    if (signalsContainer && !signalsContainer.hasAttribute('data-header-initialized')) {
        signalsContainer.setAttribute('data-header-initialized', 'true');

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
    }
}

export function ensureSignalsContainer(): HTMLElement | null {
    return document.getElementById('signals-board');
}

// Plot refresh state accessors
export function getPlotRefreshEnabled(): boolean {
    return plotRefreshEnabled;
}

export function setPlotRefreshEnabled(enabled: boolean): void {
    plotRefreshEnabled = enabled;
}

export function getPlotRefreshIntervalMs(): number {
    return plotRefreshIntervalMs;
}

export function setPlotRefreshIntervalMs(ms: number): void {
    plotRefreshIntervalMs = ms;
}

// Marker Tooltip Functions
export function showMarkerTooltip(marker: { experimentHash?: string; x?: number; y?: number; changeDetail?: string }, event: MouseEvent): void {
    let tooltip = document.getElementById('marker-tooltip') as HTMLElement;
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'marker-tooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.backgroundColor = 'var(--surface-color, #111827)';
        tooltip.style.color = 'var(--primary-text-color, #ffffff)';
        tooltip.style.padding = '10px 14px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.zIndex = '99999';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.maxWidth = '280px';
        tooltip.style.wordBreak = 'break-word';
        tooltip.style.whiteSpace = 'pre-line';
        tooltip.style.border = '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))';
        tooltip.style.lineHeight = '1.4';
        document.body.appendChild(tooltip);
    }

    const hash = marker?.experimentHash ?? 'unknown';
    const formattedHash = hash.match(/.{1,8}/g)?.join('-') || hash;

    let changes = 'Double click to restore';
    if (marker?.changeDetail) {
        const changeMessage = generateChangeMessage(marker.changeDetail);
        if (changeMessage !== 'No changes detected') {
            changes = `Changed: ${changeMessage}`;
        }
    }

    const coords = `Step: ${marker?.x ?? 'N/A'}, Value: ${marker?.y?.toFixed(4) ?? 'N/A'}`;

    tooltip.textContent = `Hash: ${formattedHash}\n${coords}\n${changes}`;
    tooltip.style.left = (event.clientX + 10) + 'px';
    tooltip.style.top = (event.clientY + 10) + 'px';
    tooltip.style.display = 'block';
}

export function hideMarkerTooltip(): void {
    const tooltip = document.getElementById('marker-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Change Detection
export function generateChangeMessage(changeDetail: string): string {
    if (!changeDetail) return 'No changes detected';

    const changes = {
        HP: false,
        MODEL: false,
        DATA: false
    };

    const lines = changeDetail.split('\n');
    lines.forEach(line => {
        if (line.includes('→')) {
            if (line.startsWith('HP')) changes.HP = true;
            if (line.startsWith('MODEL')) changes.MODEL = true;
            if (line.startsWith('DATA')) changes.DATA = true;
        }
    });

    const changedItems: string[] = [];
    if (changes.HP) changedItems.push('HP');
    if (changes.MODEL) changedItems.push('Model');
    if (changes.DATA) changedItems.push('Data');

    return changedItems.length === 0 ? 'No changes detected' : changedItems.join(' • ');
}

export function describeHashChange(prevHash: string, currHash: string): string | undefined {
    if (!prevHash || !currHash || prevHash.length < 24 || currHash.length < 24) {
        return undefined;
    }

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

// Series Processing
export function applyStride(points: SignalRawPoint[], stride: number): SignalRawPoint[] {
    if (stride <= 1 || points.length <= stride) return points;
    const out: SignalRawPoint[] = [];
    for (let i = 0; i < points.length; i++) {
        if (i % stride === 0) {
            out.push(points[i]);
        }
    }
    const tailCount = Math.min(5, points.length);
    for (let i = points.length - tailCount; i < points.length; i++) {
        const p = points[i];
        const last = out[out.length - 1];
        if (!last || last !== p) {
            out.push(p);
        }
    }
    return out;
}

export function buildSmoothedSeries(points: SignalRawPoint[], opts: {
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

export interface SignalPoint {
    x: number;
    y: number;
}

// ===== Marker/Modal UI Functions =====
/**
 * Show modal for restoring a specific marker checkpoint.
 */
export function showRestoreMarkerModal(marker: SignalRawPoint, signalName: string): void {
    let modal = document.getElementById('restore-marker-modal') as HTMLElement;
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'restore-marker-modal';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.background = 'var(--surface-color, #ffffff)';
        modal.style.border = '1px solid var(--border-color, #d1d5db)';
        modal.style.borderRadius = 'var(--radius-md, 12px)';
        modal.style.padding = '24px';
        modal.style.zIndex = '10001';
        modal.style.minWidth = '420px';
        modal.style.maxWidth = '600px';
        modal.style.boxShadow = 'var(--shadow-soft, 0 18px 45px rgba(15, 23, 42, 0.08))';
        modal.style.maxHeight = '85vh';
        modal.style.overflowY = 'auto';
        modal.style.color = 'var(--primary-text-color, #111827)';
        document.body.appendChild(modal);

        // Add overlay
        const overlay = document.createElement('div');
        overlay.id = 'restore-marker-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.35)';
        overlay.style.backdropFilter = 'blur(4px)';
        overlay.style.zIndex = '10000';
        overlay.onclick = closeRestoreMarkerModal;
        document.body.appendChild(overlay);
    }

    const changeMessage = generateChangeMessage(marker.changeDetail || '');

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--primary-text-color, #111827);">Restore Checkpoint</h2>
            <button onclick="closeRestoreMarkerModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--secondary-text-color, #6b7280); padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">×</button>
        </div>

        <div style="margin-bottom: 18px;">
            <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 6px;">Signal</label>
            <div style="color: var(--primary-text-color, #111827); font-size: 14px;">${signalName}</div>
        </div>

        <div style="margin-bottom: 18px;">
            <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 6px;">Experiment Hash</label>
            <div style="word-break: break-all; font-family: 'SF Mono', 'Monaco', 'Courier New', monospace; background: var(--surface-elevated-color, #ffffff); padding: 10px 12px; border-radius: var(--radius-sm, 8px); border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9)); font-size: 13px; color: var(--primary-text-color, #111827);">${marker.experimentHash}</div>
        </div>

        <div style="margin-bottom: 18px;">
            <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 6px;">What Changed</label>
            <div style="color: var(--primary-text-color, #111827); font-size: 14px; background: var(--surface-elevated-color, #f5f5f5); padding: 8px 12px; border-radius: var(--radius-sm, 8px); border-left: 3px solid var(--accent-color, #007aff);">${changeMessage}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
            <div>
                <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 6px;">Model Age (Steps)</label>
                <div style="color: var(--primary-text-color, #111827); font-size: 14px;">${marker.x}</div>
            </div>
            <div>
                <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 6px;">Value</label>
                <div style="color: var(--primary-text-color, #111827); font-size: 14px;">${marker.y.toFixed(4)}</div>
            </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));">
            <button onclick="closeRestoreMarkerModal()" style="padding: 10px 20px; background: var(--surface-elevated-color, #f5f5f5); color: var(--primary-text-color, #111827); border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9)); border-radius: var(--radius-sm, 8px); cursor: pointer; font-weight: 500; font-size: 14px; transition: background-color 0.2s;">Cancel</button>
            <button onclick="executeRestoreCheckpoint('${marker.experimentHash}')" style="padding: 10px 20px; background: var(--accent-color, #007aff); color: white; border: none; border-radius: var(--radius-sm, 8px); cursor: pointer; font-weight: 500; font-size: 14px; transition: background-color 0.2s;">Restore Checkpoint</button>
        </div>
    `;

    modal.style.display = 'block';
    document.getElementById('restore-marker-overlay')!.style.display = 'block';
}

/**
 * Show modal for selecting from multiple markers when they overlap.
 */
export function showMarkerSelectionModal(markers: SignalRawPoint[], signalName: string): void {
    let modal = document.getElementById('restore-marker-modal') as HTMLElement;
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'restore-marker-modal';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.background = 'var(--surface-color, #ffffff)';
        modal.style.border = '1px solid var(--border-color, #d1d5db)';
        modal.style.borderRadius = 'var(--radius-md, 12px)';
        modal.style.padding = '24px';
        modal.style.zIndex = '10001';
        modal.style.minWidth = '420px';
        modal.style.maxWidth = '700px';
        modal.style.boxShadow = 'var(--shadow-soft, 0 18px 45px rgba(15, 23, 42, 0.08))';
        modal.style.maxHeight = '85vh';
        modal.style.overflowY = 'auto';
        modal.style.color = 'var(--primary-text-color, #111827)';
        document.body.appendChild(modal);

        // Add overlay
        const overlay = document.createElement('div');
        overlay.id = 'restore-marker-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.35)';
        overlay.style.backdropFilter = 'blur(4px)';
        overlay.style.zIndex = '10000';
        overlay.onclick = closeRestoreMarkerModal;
        document.body.appendChild(overlay);
    }

    // Build marker list HTML
    const markerListHTML = markers.map((m, idx) => {
        const changeMessage = generateChangeMessage(m.changeDetail || '');
        const fullHash = m.experimentHash || 'N/A';
        const formattedHash = fullHash.match(/.{1,8}/g)?.join('-') || fullHash;

        return `
            <div onclick="selectMarkerForRestore(${idx})"
                 style="padding: 12px; margin-bottom: 8px; border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9)); border-radius: var(--radius-sm, 8px); cursor: pointer; transition: all 0.2s; background: var(--surface-elevated-color, #f9fafb);"
                 onmouseover="this.style.background='var(--accent-soft, rgba(0, 122, 255, 0.08))'; this.style.borderColor='var(--accent-color, #007aff)'"
                 onmouseout="this.style.background='var(--surface-elevated-color, #f9fafb)'; this.style.borderColor='var(--border-subtle, rgba(209, 213, 219, 0.9))'">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: var(--muted-text-color, #9ca3af);">Step ${m.x}</div>
                    <div style="font-size: 13px; color: var(--primary-text-color, #111827);">Value: ${m.y.toFixed(4)}</div>
                </div>
                <div style="font-family: 'SF Mono', 'Monaco', 'Courier New', monospace; font-size: 13px; color: var(--secondary-text-color, #6b7280); word-break: break-all; margin-bottom: 6px; line-height: 1.6;">${formattedHash}</div>
                <div style="font-size: 12px; color: var(--secondary-text-color, #6b7280); font-style: italic;">${changeMessage}</div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9));">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--primary-text-color, #111827);">Select Checkpoint to Restore</h2>
            <button onclick="closeRestoreMarkerModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--secondary-text-color, #6b7280); padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">×</button>
        </div>

        <div style="margin-bottom: 12px;">
            <label style="font-weight: 600; font-size: 13px; color: var(--secondary-text-color, #6b7280); display: block; margin-bottom: 8px;">Signal: ${signalName}</label>
            <div style="font-size: 13px; color: var(--muted-text-color, #9ca3af); margin-bottom: 12px;">${markers.length} checkpoints found in this area. Click one to restore:</div>
        </div>

        <div style="max-height: 400px; overflow-y: auto; scrollbar-width: none;">
            ${markerListHTML}
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9)); margin-top: 16px;">
            <button onclick="closeRestoreMarkerModal()" style="padding: 10px 20px; background: var(--surface-elevated-color, #f5f5f5); color: var(--primary-text-color, #111827); border: 1px solid var(--border-subtle, rgba(209, 213, 219, 0.9)); border-radius: var(--radius-sm, 8px); cursor: pointer; font-weight: 500; font-size: 14px; transition: background-color 0.2s;">Cancel</button>
        </div>
    `;

    (window as any).currentMarkerSelection = markers;
    modal.style.display = 'block';
    document.getElementById('restore-marker-overlay')!.style.display = 'block';
}

/**
 * Close restore marker modal.
 */
export function closeRestoreMarkerModal(): void {
    const modal = document.getElementById('restore-marker-modal');
    const overlay = document.getElementById('restore-marker-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

/**
 * Execute checkpoint restoration via API
 */
export async function executeRestoreCheckpoint(experimentHash: string): Promise<void> {
    try {
        const dataClient = (window as any).dataClient;
        if (!dataClient) {
            console.error('Data client not available');
            alert('Error: Data client not initialized');
            return;
        }

        closeRestoreMarkerModal();

        // Call the restoreCheckpoint RPC
        const response = await dataClient.restoreCheckpoint({
            experimentHash: experimentHash
        });

        if (response.response.success) {
            console.log('Checkpoint restored successfully:', response.response.message);
            alert('Checkpoint restored successfully');
            // Note: The UI will update automatically via the websocket stream of new data
        } else {
            console.error('Checkpoint restore failed:', response.response.message);
            alert('Checkpoint restore failed: ' + response.response.message);
        }
    } catch (error) {
        console.error('Error restoring checkpoint:', error);
        alert('Error restoring checkpoint: ' + (error as Error).message);
    }
}

// Expose window functions for inline click handlers
(window as any).closeRestoreMarkerModal = closeRestoreMarkerModal;
(window as any).executeRestoreCheckpoint = executeRestoreCheckpoint;
(window as any).selectMarkerForRestore = function(index: number) {
    const markers = (window as any).currentMarkerSelection;
    if (markers && markers[index]) {
        closeRestoreMarkerModal();
        setTimeout(() => {
            showRestoreMarkerModal(markers[index], 'Selected Signal');
        }, 100);
    }
};
