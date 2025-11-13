import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { ExperimentServiceClient } from "./generated/experiment_service.client";
class GrpcClientApp {
    constructor(serverUrl = "http://localhost:8080") {
        // Create gRPC-Web transport
        this.transport = new GrpcWebFetchTransport({
            baseUrl: serverUrl,
            format: "binary",
        });
        // Create the client
        this.client = new ExperimentServiceClient(this.transport);
    }
    async fetchSamples(sampleIds, origin = "train") {
        try {
            console.log("Connecting to gRPC server...");
            const request = {
                sampleIds: sampleIds,
                origin: origin,
                resizeWidth: 224,
                resizeHeight: 224,
            };
            console.log("Sending request:", request);
            // Call the gRPC service
            const response = await this.client.getSamples(request);
            console.log("Received response:", response.response);
            const sampleCount = response.response.samples?.length || 0;
            // Display sample count in the UI
            this.displaySampleCount(sampleCount);
            // Display detailed sample information
            this.displaySamples(response.response);
            // Print data to console
            this.printSampleData(response.response);
        }
        catch (error) {
            console.error("Error calling gRPC service:", error);
            this.displayError(error);
        }
    }
    displaySampleCount(count) {
        const countContainer = document.getElementById("sample-count");
        if (countContainer) {
            countContainer.innerHTML = `
        <div class="count-display">
          <h2>Samples Received</h2>
          <div class="count-number">${count}</div>
        </div>
      `;
        }
    }
    displaySamples(data) {
        const container = document.getElementById("samples-container");
        if (container) {
            container.innerHTML = ""; // Clear previous content
            data.samples?.forEach((sample, index) => {
                const sampleElement = document.createElement("div");
                sampleElement.className = "sample-item";
                sampleElement.innerHTML = `
          <h4>Sample ${index + 1}</h4>
          <p><strong>ID:</strong> ${sample.sampleId}</p>
          <p><strong>Origin:</strong> ${sample.origin}</p>
          <p><strong>Label:</strong> ${sample.label || 'N/A'}</p>
          <p><strong>Has Data:</strong> ${sample.data ? 'Yes' : 'No'}</p>
          <p><strong>Has Mask:</strong> ${sample.mask ? 'Yes' : 'No'}</p>
          <p><strong>Has Prediction:</strong> ${sample.prediction ? 'Yes' : 'No'}</p>
        `;
                container.appendChild(sampleElement);
            });
        }
    }
    displayError(error) {
        const container = document.getElementById("error-container");
        if (container) {
            container.innerHTML = `
        <div class="error-item">
          <h3>Error</h3>
          <p>${error.message}</p>
        </div>
      `;
        }
    }
    printSampleData(data) {
        console.log("=== Samples Received ===");
        console.log(`Total Samples: ${data.samples?.length || 0}`);
        data.samples?.forEach((sample, index) => {
            console.log(`Sample ${index + 1}:`, {
                sample_id: sample.sampleId,
                origin: sample.origin,
                label: sample.label,
                has_data: !!sample.data,
                has_mask: !!sample.mask,
                has_prediction: !!sample.prediction
            });
        });
        console.log("====================");
    }
    disconnect() {
        console.log("Disconnecting from gRPC server...");
    }
}
// Initialize and export the app
export default GrpcClientApp;
