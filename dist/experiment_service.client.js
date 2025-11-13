import { ExperimentService } from "./experiment_service";
import { stackIntercept } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service ExperimentService
 */
export class ExperimentServiceClient {
    constructor(_transport) {
        this._transport = _transport;
        this.typeName = ExperimentService.typeName;
        this.methods = ExperimentService.methods;
        this.options = ExperimentService.options;
    }
    /**
     * @generated from protobuf rpc: StreamStatus
     */
    streamStatus(input, options) {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return stackIntercept("serverStreaming", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ExperimentCommand
     */
    experimentCommand(input, options) {
        const method = this.methods[1], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ManipulateWeights
     */
    manipulateWeights(input, options) {
        const method = this.methods[2], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetSample
     */
    getSample(input, options) {
        const method = this.methods[3], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetWeights
     */
    getWeights(input, options) {
        const method = this.methods[4], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetSamples
     */
    getSamples(input, options) {
        const method = this.methods[5], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetActivations
     */
    getActivations(input, options) {
        const method = this.methods[6], opt = this._transport.mergeOptions(options);
        return stackIntercept("unary", this._transport, method, opt, input);
    }
}
