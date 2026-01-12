/**
 * Performance Monitor for Weights Studio
 * Tracks and logs metrics for gRPC requests, data reception, and UI rendering
 */

interface MetricEntry {
    timestamp: number;
    duration: number;
    sampleId?: number;
    dataType?: string;
}

interface MetricsAggregate {
    count: number;
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    lastDuration: number;
}

export class PerformanceMonitor {
    private requestMetrics = new Map<string, MetricEntry[]>();
    private renderMetrics = new Map<string, MetricEntry[]>();
    private activeRequests = new Map<string, number>();
    private logInterval: number | null = null;
    private enableLogging: boolean = true;

    constructor(autoLogInterval: number = 30000) {
        this.startAutoLogging(autoLogInterval);
    }

    /**
     * Mark the start of a request
     */
    public startRequest(requestId: string, dataType: string = 'unknown'): void {
        this.activeRequests.set(requestId, Date.now());
        if (this.enableLogging) {
            console.debug(`[perf] REQUEST START: ${dataType} (${requestId})`);
        }
    }

    /**
     * Mark the end of a request and record metrics
     */
    public endRequest(requestId: string, sampleId?: number, dataType: string = 'unknown'): void {
        const startTime = this.activeRequests.get(requestId);
        if (!startTime) {
            console.warn(`[perf] No start time found for request: ${requestId}`);
            return;
        }

        const duration = Date.now() - startTime;
        const metricKey = `request_${dataType}`;

        if (!this.requestMetrics.has(metricKey)) {
            this.requestMetrics.set(metricKey, []);
        }

        this.requestMetrics.get(metricKey)!.push({
            timestamp: Date.now(),
            duration,
            sampleId,
            dataType,
        });

        this.activeRequests.delete(requestId);

        if (this.enableLogging) {
            console.debug(
                `[perf] REQUEST END: ${dataType} - ${duration}ms ${sampleId !== undefined ? `(sample ${sampleId})` : ''}`
            );
        }
    }

    /**
     * Track time from data received to UI rendered
     */
    public startRender(renderId: string, dataType: string = 'unknown'): void {
        this.activeRequests.set(`render_${renderId}`, Date.now());
        if (this.enableLogging) {
            console.debug(`[perf] RENDER START: ${dataType} (${renderId})`);
        }
    }

    /**
     * Mark the end of rendering
     */
    public endRender(renderId: string, sampleId?: number, dataType: string = 'unknown'): void {
        const startTime = this.activeRequests.get(`render_${renderId}`);
        if (!startTime) {
            console.warn(`[perf] No start time found for render: ${renderId}`);
            return;
        }

        const duration = Date.now() - startTime;
        const metricKey = `render_${dataType}`;

        if (!this.renderMetrics.has(metricKey)) {
            this.renderMetrics.set(metricKey, []);
        }

        this.renderMetrics.get(metricKey)!.push({
            timestamp: Date.now(),
            duration,
            sampleId,
            dataType,
        });

        this.activeRequests.delete(`render_${renderId}`);

        if (this.enableLogging) {
            console.debug(
                `[perf] RENDER END: ${dataType} - ${duration}ms ${sampleId !== undefined ? `(sample ${sampleId})` : ''}`
            );
        }
    }

    /**
     * Calculate aggregated metrics for a specific metric type
     */
    private calculateAggregate(metrics: MetricEntry[]): MetricsAggregate {
        if (metrics.length === 0) {
            return {
                count: 0,
                totalDuration: 0,
                averageDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                lastDuration: 0,
            };
        }

        const durations = metrics.map(m => m.duration);
        const totalDuration = durations.reduce((a, b) => a + b, 0);

        return {
            count: metrics.length,
            totalDuration,
            averageDuration: totalDuration / metrics.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            lastDuration: metrics[metrics.length - 1].duration,
        };
    }

    /**
     * Get metrics summary for all tracked operations
     */
    public getSummary(): {
        requests: Map<string, MetricsAggregate>;
        renders: Map<string, MetricsAggregate>;
    } {
        const requestSummary = new Map<string, MetricsAggregate>();
        const renderSummary = new Map<string, MetricsAggregate>();

        for (const [key, metrics] of this.requestMetrics.entries()) {
            requestSummary.set(key, this.calculateAggregate(metrics));
        }

        for (const [key, metrics] of this.renderMetrics.entries()) {
            renderSummary.set(key, this.calculateAggregate(metrics));
        }

        return { requests: requestSummary, renders: renderSummary };
    }

    /**
     * Log current metrics to console
     */
    public logMetrics(): void {
        const summary = this.getSummary();

        console.group('⏱️  WEIGHTS STUDIO PERFORMANCE METRICS');

        console.group('📊 gRPC Request Metrics');
        if (summary.requests.size === 0) {
            console.log('No request metrics recorded');
        } else {
            for (const [key, metrics] of summary.requests.entries()) {
                console.table({
                    Type: key.replace('request_', ''),
                    'Requests': metrics.count,
                    'Avg Time (ms)': metrics.averageDuration.toFixed(2),
                    'Min (ms)': metrics.minDuration.toFixed(2),
                    'Max (ms)': metrics.maxDuration.toFixed(2),
                    'Last (ms)': metrics.lastDuration.toFixed(2),
                    'Total (ms)': metrics.totalDuration.toFixed(0),
                });
            }
        }
        console.groupEnd();

        console.group('🎨 UI Rendering Metrics');
        if (summary.renders.size === 0) {
            console.log('No render metrics recorded');
        } else {
            for (const [key, metrics] of summary.renders.entries()) {
                console.table({
                    Type: key.replace('render_', ''),
                    'Renders': metrics.count,
                    'Avg Time (ms)': metrics.averageDuration.toFixed(2),
                    'Min (ms)': metrics.minDuration.toFixed(2),
                    'Max (ms)': metrics.maxDuration.toFixed(2),
                    'Last (ms)': metrics.lastDuration.toFixed(2),
                    'Total (ms)': metrics.totalDuration.toFixed(0),
                });
            }
        }
        console.groupEnd();

        console.groupEnd();
    }

    /**
     * Calculate average time by image
     */
    public getAverageTimePerImage(): void {
        const summary = this.getSummary();

        console.group('📸 AVERAGE TIME PER IMAGE');

        const imageMetrics = new Map<string, { request: number; render: number }>();

        // Collect request times by sample
        for (const [key, metrics] of summary.requests.entries()) {
            if (metrics.count > 0) {
                const dataType = key.replace('request_', '');
                if (!imageMetrics.has(dataType)) {
                    imageMetrics.set(dataType, { request: 0, render: 0 });
                }
                const current = imageMetrics.get(dataType)!;
                current.request = metrics.averageDuration;
            }
        }

        // Collect render times by sample
        for (const [key, metrics] of summary.renders.entries()) {
            if (metrics.count > 0) {
                const dataType = key.replace('render_', '');
                if (!imageMetrics.has(dataType)) {
                    imageMetrics.set(dataType, { request: 0, render: 0 });
                }
                const current = imageMetrics.get(dataType)!;
                current.render = metrics.averageDuration;
            }
        }

        // Print per-image metrics
        const perImageData = Array.from(imageMetrics.entries()).map(([type, times]) => ({
            'Data Type': type,
            'Avg Request Time (ms)': times.request.toFixed(2),
            'Avg Render Time (ms)': times.render.toFixed(2),
            'Avg Total Time (ms)': (times.request + times.render).toFixed(2),
        }));

        console.table(perImageData);
        console.groupEnd();
    }

    /**
     * Start automatic periodic logging
     */
    private startAutoLogging(intervalMs: number): void {
        if (this.logInterval) clearInterval(this.logInterval);
        this.logInterval = window.setInterval(() => {
            this.logMetrics();
            this.getAverageTimePerImage();
        }, intervalMs);
    }

    /**
     * Stop automatic logging
     */
    public stopAutoLogging(): void {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }

    /**
     * Reset all metrics
     */
    public reset(): void {
        this.requestMetrics.clear();
        this.renderMetrics.clear();
        this.activeRequests.clear();
        console.info('[perf] All metrics reset');
    }

    /**
     * Enable/disable detailed logging
     */
    public setDetailedLogging(enabled: boolean): void {
        this.enableLogging = enabled;
        console.info(`[perf] Detailed logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Export metrics as JSON for external analysis
     */
    public exportMetricsJSON(): string {
        const summary = this.getSummary();
        return JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                requests: Object.fromEntries(summary.requests),
                renders: Object.fromEntries(summary.renders),
            },
            null,
            2
        );
    }
}

// Global instance
export const perfMonitor = new PerformanceMonitor(30000); // Log every 30 seconds
