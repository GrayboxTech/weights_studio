
async function updateView() {
    if (!cellsContainer) {
        console.warn('[updateView] cellsContainer is missing.');
        return;
    }

    const startIndex = traversalPanel.getStartIndex();
    const magnification = traversalPanel.getMagnification();
    const { cols, rows, gridCount, cellWidth, cellHeight } = calculateGridDimensions();

    const layoutInfo = gridManager.updateGridLayout();
    await updateImages(startIndex, layoutInfo.gridCount, layoutInfo.cellWidth, layoutInfo.cellHeight);
    traversalPanel.updateSliderTooltip(currentGridCount, sortedSampleIds.length - 1);
}

// async function fetchAndDisplaySamples() {
//     const startIndex = traversalPanel.getStartIndex();
//     const count = gridManager.calculateGridDimensions().gridCount;

//     try {
//         const request: SamplesRequest = {
//             startIndex: startIndex,
//             recordsCnt: count,
//             includeRawData: true,
//             includeTransformedData: false,
//             statsToRetrieve: [] // Empty means all stats
//         };
//         const response = await dataClient.getSamples(request).response;
//         if (response.success) {
//             gridManager.populateCells(response.dataRecords);
//         } else {
//             console.error("Failed to retrieve samples:", response.message);
//         }
//     } catch (error) {
//         console.error("Error fetching samples:", error);
//     }
// }



// async function updateImages(startIndex: number, gridCount: number, cellWidth: number, cellHeight: number) {
//     console.log('[updateImages] called with startIndex:', startIndex, 'gridCount:', gridCount);

//     if (gridCount === 0 || !cellsContainer) return;

//     const sampleIdsToFetch: number[] = [];
//     for (let i = 0; i < gridCount; i++) {
//         const index = startIndex + i;
//         if (index < sortedSampleIds.length) {
//             sampleIdsToFetch.push(sortedSampleIds[index]);
//         }
//     }

//     if (sampleIdsToFetch.length === 0) return;

//     try {
//         const request: BatchSampleRequest = {
//             sampleIds: sampleIdsToFetch,
//             origin: 'train',
//             resizeWidth: cellWidth,
//             resizeHeight: cellHeight,
//         };

//         const response = await client.getSamples(request);
//         const cells = cellsContainer.querySelectorAll('.cell');

//         const BATCH_SIZE = 32;
//         const DELAY_BETWEEN_ITEMS = 10;
        
//         for (let batchStart = 0; batchStart < response.response.samples.length; batchStart += BATCH_SIZE) {
//             const batchEnd = Math.min(batchStart + BATCH_SIZE, response.response.samples.length);
//             const batchPromises = [];
            
//             for (let i = batchStart; i < batchEnd; i++) {
//                 const sample = response.response.samples[i];
//                 const cell = cells[i] as HTMLElement;
                
//                 if (sample?.data?.length && cell) {
//                     const promise = new Promise<void>((resolve) => {
//                         setTimeout(() => {
//                             const img = cell.querySelector('img');
                            
//                             if (img) {
//                                 img.style.opacity = '0';
//                                 img.style.transition = 'opacity 0.1s ease-in';
                                
//                                 const base64Image = bytesToBase64(sample.rawData);
//                                 img.src = `data:image/png;base64,${base64Image}`;
//                                 img.alt = `Sample ${sample.sampleId}`;
                                
//                                 img.onload = () => {
//                                     img.style.opacity = '1';
//                                 };
//                             }
                            
//                             resolve();
//                         }, (i - batchStart) * DELAY_BETWEEN_ITEMS);
//                     });
                    
//                     batchPromises.push(promise);
//                 }
//             }
            
//             await Promise.all(batchPromises);
//         }
        
//         updateCellLabels();
        
//     } catch (error) {
//         console.error('Error fetching samples:', error);
//         cellsContainer.textContent = 'Failed to load images.';
//     }
// }