
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { DataServiceClient } from "./data_service.client";
import { QueryRequest, QueryResponse, SamplesRequest, SamplesResponse } from "./data_service";
import { DataDisplayOptionsPanel } from "./DataDisplayOptionsPanel";
import { DataTraversalAndInteractionsPanel } from "./DataTraversalAndInteractionsPanel";
import { GridManager } from "./GridManager";

const SERVER_URL = "http://localhost:8080";

export type SplitColors = {
    train: string;
    eval: string;
};

type DisplayPreferences = {
    splitColors: SplitColors;
    [key: string]: any;
};

type GridDimensions = {
    gridCount: number;
    cols: number;
    rows: number;
};

const transport = new GrpcWebFetchTransport({
    baseUrl: SERVER_URL,
    format: "binary",
});

const dataClient = new DataServiceClient(transport);

export const App: React.FC = () => {
    const [cellSize, setCellSize] = useState(100);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [trainColor, setTrainColor] = useState('#0000ff');
    const [evalColor, setEvalColor] = useState('#ff0000');
    const [samples, setSamples] = useState<any[]>([]);
    const [gridDimensions, setGridDimensions] = useState<GridDimensions>({ gridCount: 0, cols: 0, rows: 0 });
    const [startIndex, setStartIndex] = useState(0);
    const [maxSampleId, setMaxSampleId] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cellsContainerRef = useRef<HTMLDivElement>(null);
    const gridManagerRef = useRef<GridManager | null>(null);
    const traversalPanelRef = useRef<DataTraversalAndInteractionsPanel | null>(null);
    const displayOptionsPanelRef = useRef<DataDisplayOptionsPanel | null>(null);
    const currentFetchRequestIdRef = useRef(0);

    // Initialize panels on mount
    useEffect(() => {
        if (!cellsContainerRef.current) return;

        traversalPanelRef.current = new DataTraversalAndInteractionsPanel();
        traversalPanelRef.current.initialize();

        const detailsOptionsRow = document.querySelector('.details-options-row') as HTMLElement;
        if (detailsOptionsRow) {
            displayOptionsPanelRef.current = new DataDisplayOptionsPanel(detailsOptionsRow);
            displayOptionsPanelRef.current.initialize();
        }

        gridManagerRef.current = new GridManager(
            cellsContainerRef.current,
            traversalPanelRef.current,
            displayOptionsPanelRef.current as DataDisplayOptionsPanel
        );

        // Load initial sample count
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const request: QueryRequest = { query: "", accumulate: false, isNaturalLanguage: false };
            const response: QueryResponse = await dataClient.applyQuery(request).response;
            const sampleCount = response.numberOfAllSamples;
            setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);

            if (sampleCount > 0 && displayOptionsPanelRef.current) {
                const sampleRequest: SamplesRequest = {
                    startIndex: 0,
                    recordsCnt: 1,
                    includeRawData: true,
                    includeTransformedData: false,
                    statsToRetrieve: []
                };
                const sampleResponse = await dataClient.getSamples(sampleRequest).response;
                if (sampleResponse.success && sampleResponse.dataRecords.length > 0) {
                    displayOptionsPanelRef.current.populateOptions(sampleResponse.dataRecords);
                }
            }
        } catch (err) {
            console.error('Error loading initial data:', err);
            setError('Failed to load initial data');
        }
    };

    // Calculate grid dimensions when cellSize or zoomLevel changes
    useEffect(() => {
        if (!gridManagerRef.current || !cellsContainerRef.current) return;

        gridManagerRef.current.updateGridLayout();
        const dims = gridManagerRef.current.calculateGridDimensions();
        setGridDimensions(dims);

        if (traversalPanelRef.current) {
            traversalPanelRef.current.updateSliderStep(dims.gridCount);
            traversalPanelRef.current.updateSliderTooltip();
        }
    }, [cellSize, zoomLevel]);

    // Fetch samples when grid dimensions or startIndex changes
    useEffect(() => {
        if (gridDimensions.gridCount === 0) return;
        fetchAndDisplaySamples();
    }, [gridDimensions, startIndex]);

    const getSplitColors = useCallback((): SplitColors => {
        return { train: trainColor, eval: evalColor };
    }, [trainColor, evalColor]);

    const fetchAndDisplaySamples = async () => {
        if (!displayOptionsPanelRef.current || !gridManagerRef.current) return;

        const batchSize = 32;
        const requestId = ++currentFetchRequestIdRef.current;
        const count = gridDimensions.gridCount;

        setLoading(true);
        setError(null);

        try {
            gridManagerRef.current.clearAllCells();
            let totalRecordsRetrieved = 0;

            for (let i = 0; i < count; i += batchSize) {
                if (requestId !== currentFetchRequestIdRef.current) {
                    console.debug(`Discarding obsolete fetch request ${requestId}`);
                    return;
                }

                const maxStartIndex = Math.max(0, maxSampleId - count + 1);
                if (startIndex > maxStartIndex) {
                    console.debug(`Start index ${startIndex} exceeds max ${maxStartIndex}`);
                    return;
                }

                const currentBatchSize = Math.min(batchSize, count - i);
                const request: SamplesRequest = {
                    startIndex: startIndex + i,
                    recordsCnt: currentBatchSize,
                    includeRawData: true,
                    includeTransformedData: false,
                    statsToRetrieve: []
                };

                const response = await dataClient.getSamples(request).response;

                if (requestId !== currentFetchRequestIdRef.current) {
                    console.debug(`Discarding obsolete batch ${i}`);
                    return;
                }

                if (response.success && response.dataRecords.length > 0) {
                    const preferences = displayOptionsPanelRef.current.getDisplayPreferences();
                    preferences.splitColors = getSplitColors();

                    response.dataRecords.forEach((record, index) => {
                        const cell = gridManagerRef.current?.getCellbyIndex(i + index);
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
        } catch (err) {
            console.error("Error fetching samples:", err);
            setError('Failed to fetch samples');
        } finally {
            setLoading(false);
        }
    };

    const handleQuerySubmit = async (query: string) => {
        try {
            const request: QueryRequest = { query, accumulate: false, isNaturalLanguage: true };
            const response: QueryResponse = await dataClient.applyQuery(request).response;
            const sampleCount = response.numberOfAllSamples;

            let newStartIndex = startIndex;
            const gridCount = gridDimensions.gridCount;

            if (sampleCount === 0) {
                newStartIndex = 0;
            } else if (newStartIndex >= sampleCount) {
                newStartIndex = Math.max(0, sampleCount - gridCount);
            } else if (newStartIndex + gridCount > sampleCount) {
                newStartIndex = Math.max(0, sampleCount - gridCount);
            }

            setMaxSampleId(sampleCount > 0 ? sampleCount - 1 : 0);
            setStartIndex(newStartIndex);
        } catch (err) {
            console.error('Error applying query:', err);
            setError('Failed to apply query');
        }
    };

    const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            e.preventDefault();
            handleQuerySubmit(e.currentTarget.value.trim());
            e.currentTarget.value = '';
        }
    };

    return (
        <div className="app">
            <div className="chat-section">
                <input
                    id="chat-input"
                    type="text"
                    placeholder="Enter query..."
                    onKeyDown={handleChatInputKeyDown}
                />
            </div>

            <div className="controls">
                <div>
                    <label>Cell Size: <span id="cell-size-value">{cellSize}</span></label>
                    <input
                        id="cell-size"
                        type="range"
                        min="50"
                        max="300"
                        value={cellSize}
                        onChange={(e) => setCellSize(Number(e.target.value))}
                    />
                </div>

                <div>
                    <label>Zoom: <span id="zoom-value">{zoomLevel}%</span></label>
                    <input
                        id="zoom-level"
                        type="range"
                        min="50"
                        max="200"
                        value={zoomLevel}
                        onChange={(e) => setZoomLevel(Number(e.target.value))}
                    />
                </div>

                <div>
                    <label>Train Color:</label>
                    <input
                        id="train-color"
                        type="color"
                        value={trainColor}
                        onChange={(e) => setTrainColor(e.target.value)}
                    />
                </div>

                <div>
                    <label>Eval Color:</label>
                    <input
                        id="eval-color"
                        type="color"
                        value={evalColor}
                        onChange={(e) => setEvalColor(e.target.value)}
                    />
                </div>
            </div>

            <div className="details-options-row" />

            <div
                id="cells-grid"
                ref={cellsContainerRef}
                className="cells-grid"
                style={{
                    display: 'grid',
                    gap: '8px',
                    padding: '16px',
                }}
            />

            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">{error}</div>}
        </div>
    );
};

export default App;
