// package: 
// file: experiment_service.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class Empty extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Empty.AsObject;
    static toObject(includeInstance: boolean, msg: Empty): Empty.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Empty, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Empty;
    static deserializeBinaryFromReader(message: Empty, reader: jspb.BinaryReader): Empty;
}

export namespace Empty {
    export type AsObject = {
    }
}

export class NeuronId extends jspb.Message { 
    getLayerId(): number;
    setLayerId(value: number): NeuronId;
    getNeuronId(): number;
    setNeuronId(value: number): NeuronId;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NeuronId.AsObject;
    static toObject(includeInstance: boolean, msg: NeuronId): NeuronId.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NeuronId, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NeuronId;
    static deserializeBinaryFromReader(message: NeuronId, reader: jspb.BinaryReader): NeuronId;
}

export namespace NeuronId {
    export type AsObject = {
        layerId: number,
        neuronId: number,
    }
}

export class WeightOperation extends jspb.Message { 

    hasOpType(): boolean;
    clearOpType(): void;
    getOpType(): WeightOperationType | undefined;
    setOpType(value: WeightOperationType): WeightOperation;

    hasLayerId(): boolean;
    clearLayerId(): void;
    getLayerId(): number | undefined;
    setLayerId(value: number): WeightOperation;
    clearNeuronIdsList(): void;
    getNeuronIdsList(): Array<NeuronId>;
    setNeuronIdsList(value: Array<NeuronId>): WeightOperation;
    addNeuronIds(value?: NeuronId, index?: number): NeuronId;
    getNeuronsToAdd(): number;
    setNeuronsToAdd(value: number): WeightOperation;
    clearZerofyFromIncomingIdsList(): void;
    getZerofyFromIncomingIdsList(): Array<number>;
    setZerofyFromIncomingIdsList(value: Array<number>): WeightOperation;
    addZerofyFromIncomingIds(value: number, index?: number): number;
    clearZerofyToNeuronIdsList(): void;
    getZerofyToNeuronIdsList(): Array<number>;
    setZerofyToNeuronIdsList(value: Array<number>): WeightOperation;
    addZerofyToNeuronIds(value: number, index?: number): number;
    clearZerofyPredicatesList(): void;
    getZerofyPredicatesList(): Array<ZerofyPredicate>;
    setZerofyPredicatesList(value: Array<ZerofyPredicate>): WeightOperation;
    addZerofyPredicates(value: ZerofyPredicate, index?: number): ZerofyPredicate;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): WeightOperation.AsObject;
    static toObject(includeInstance: boolean, msg: WeightOperation): WeightOperation.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: WeightOperation, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): WeightOperation;
    static deserializeBinaryFromReader(message: WeightOperation, reader: jspb.BinaryReader): WeightOperation;
}

export namespace WeightOperation {
    export type AsObject = {
        opType?: WeightOperationType,
        layerId?: number,
        neuronIdsList: Array<NeuronId.AsObject>,
        neuronsToAdd: number,
        zerofyFromIncomingIdsList: Array<number>,
        zerofyToNeuronIdsList: Array<number>,
        zerofyPredicatesList: Array<ZerofyPredicate>,
    }
}

export class WeightsOperationRequest extends jspb.Message { 

    hasWeightOperation(): boolean;
    clearWeightOperation(): void;
    getWeightOperation(): WeightOperation | undefined;
    setWeightOperation(value?: WeightOperation): WeightsOperationRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): WeightsOperationRequest.AsObject;
    static toObject(includeInstance: boolean, msg: WeightsOperationRequest): WeightsOperationRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: WeightsOperationRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): WeightsOperationRequest;
    static deserializeBinaryFromReader(message: WeightsOperationRequest, reader: jspb.BinaryReader): WeightsOperationRequest;
}

export namespace WeightsOperationRequest {
    export type AsObject = {
        weightOperation?: WeightOperation.AsObject,
    }
}

export class WeightsOperationResponse extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): WeightsOperationResponse;
    getMessage(): string;
    setMessage(value: string): WeightsOperationResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): WeightsOperationResponse.AsObject;
    static toObject(includeInstance: boolean, msg: WeightsOperationResponse): WeightsOperationResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: WeightsOperationResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): WeightsOperationResponse;
    static deserializeBinaryFromReader(message: WeightsOperationResponse, reader: jspb.BinaryReader): WeightsOperationResponse;
}

export namespace WeightsOperationResponse {
    export type AsObject = {
        success: boolean,
        message: string,
    }
}

export class HyperParameters extends jspb.Message { 

    hasExperimentName(): boolean;
    clearExperimentName(): void;
    getExperimentName(): string | undefined;
    setExperimentName(value: string): HyperParameters;

    hasTrainingStepsToDo(): boolean;
    clearTrainingStepsToDo(): void;
    getTrainingStepsToDo(): number | undefined;
    setTrainingStepsToDo(value: number): HyperParameters;

    hasLearningRate(): boolean;
    clearLearningRate(): void;
    getLearningRate(): number | undefined;
    setLearningRate(value: number): HyperParameters;

    hasBatchSize(): boolean;
    clearBatchSize(): void;
    getBatchSize(): number | undefined;
    setBatchSize(value: number): HyperParameters;

    hasFullEvalFrequency(): boolean;
    clearFullEvalFrequency(): void;
    getFullEvalFrequency(): number | undefined;
    setFullEvalFrequency(value: number): HyperParameters;

    hasCheckpontFrequency(): boolean;
    clearCheckpontFrequency(): void;
    getCheckpontFrequency(): number | undefined;
    setCheckpontFrequency(value: number): HyperParameters;

    hasIsTraining(): boolean;
    clearIsTraining(): void;
    getIsTraining(): boolean | undefined;
    setIsTraining(value: boolean): HyperParameters;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): HyperParameters.AsObject;
    static toObject(includeInstance: boolean, msg: HyperParameters): HyperParameters.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: HyperParameters, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): HyperParameters;
    static deserializeBinaryFromReader(message: HyperParameters, reader: jspb.BinaryReader): HyperParameters;
}

export namespace HyperParameters {
    export type AsObject = {
        experimentName?: string,
        trainingStepsToDo?: number,
        learningRate?: number,
        batchSize?: number,
        fullEvalFrequency?: number,
        checkpontFrequency?: number,
        isTraining?: boolean,
    }
}

export class MetricsStatus extends jspb.Message { 
    getName(): string;
    setName(value: string): MetricsStatus;
    getValue(): number;
    setValue(value: number): MetricsStatus;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): MetricsStatus.AsObject;
    static toObject(includeInstance: boolean, msg: MetricsStatus): MetricsStatus.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: MetricsStatus, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): MetricsStatus;
    static deserializeBinaryFromReader(message: MetricsStatus, reader: jspb.BinaryReader): MetricsStatus;
}

export namespace MetricsStatus {
    export type AsObject = {
        name: string,
        value: number,
    }
}

export class AnnotatStatus extends jspb.Message { 
    getName(): string;
    setName(value: string): AnnotatStatus;

    getMetadataMap(): jspb.Map<string, number>;
    clearMetadataMap(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AnnotatStatus.AsObject;
    static toObject(includeInstance: boolean, msg: AnnotatStatus): AnnotatStatus.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: AnnotatStatus, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AnnotatStatus;
    static deserializeBinaryFromReader(message: AnnotatStatus, reader: jspb.BinaryReader): AnnotatStatus;
}

export namespace AnnotatStatus {
    export type AsObject = {
        name: string,

        metadataMap: Array<[string, number]>,
    }
}

export class TrainingStatusEx extends jspb.Message { 

    hasTimestamp(): boolean;
    clearTimestamp(): void;
    getTimestamp(): string | undefined;
    setTimestamp(value: string): TrainingStatusEx;

    hasExperimentName(): boolean;
    clearExperimentName(): void;
    getExperimentName(): string | undefined;
    setExperimentName(value: string): TrainingStatusEx;

    hasModelAge(): boolean;
    clearModelAge(): void;
    getModelAge(): number | undefined;
    setModelAge(value: number): TrainingStatusEx;

    hasMetricsStatus(): boolean;
    clearMetricsStatus(): void;
    getMetricsStatus(): MetricsStatus | undefined;
    setMetricsStatus(value?: MetricsStatus): TrainingStatusEx;

    hasAnnotatStatus(): boolean;
    clearAnnotatStatus(): void;
    getAnnotatStatus(): AnnotatStatus | undefined;
    setAnnotatStatus(value?: AnnotatStatus): TrainingStatusEx;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TrainingStatusEx.AsObject;
    static toObject(includeInstance: boolean, msg: TrainingStatusEx): TrainingStatusEx.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TrainingStatusEx, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TrainingStatusEx;
    static deserializeBinaryFromReader(message: TrainingStatusEx, reader: jspb.BinaryReader): TrainingStatusEx;
}

export namespace TrainingStatusEx {
    export type AsObject = {
        timestamp?: string,
        experimentName?: string,
        modelAge?: number,
        metricsStatus?: MetricsStatus.AsObject,
        annotatStatus?: AnnotatStatus.AsObject,
    }
}

export class HyperParameterCommand extends jspb.Message { 

    hasHyperParameters(): boolean;
    clearHyperParameters(): void;
    getHyperParameters(): HyperParameters | undefined;
    setHyperParameters(value?: HyperParameters): HyperParameterCommand;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): HyperParameterCommand.AsObject;
    static toObject(includeInstance: boolean, msg: HyperParameterCommand): HyperParameterCommand.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: HyperParameterCommand, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): HyperParameterCommand;
    static deserializeBinaryFromReader(message: HyperParameterCommand, reader: jspb.BinaryReader): HyperParameterCommand;
}

export namespace HyperParameterCommand {
    export type AsObject = {
        hyperParameters?: HyperParameters.AsObject,
    }
}

export class DenySamplesOperation extends jspb.Message { 
    clearSampleIdsList(): void;
    getSampleIdsList(): Array<number>;
    setSampleIdsList(value: Array<number>): DenySamplesOperation;
    addSampleIds(value: number, index?: number): number;
    getAccumulate(): boolean;
    setAccumulate(value: boolean): DenySamplesOperation;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DenySamplesOperation.AsObject;
    static toObject(includeInstance: boolean, msg: DenySamplesOperation): DenySamplesOperation.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DenySamplesOperation, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DenySamplesOperation;
    static deserializeBinaryFromReader(message: DenySamplesOperation, reader: jspb.BinaryReader): DenySamplesOperation;
}

export namespace DenySamplesOperation {
    export type AsObject = {
        sampleIdsList: Array<number>,
        accumulate: boolean,
    }
}

export class LoadCheckpointOperation extends jspb.Message { 
    getCheckpointId(): number;
    setCheckpointId(value: number): LoadCheckpointOperation;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): LoadCheckpointOperation.AsObject;
    static toObject(includeInstance: boolean, msg: LoadCheckpointOperation): LoadCheckpointOperation.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: LoadCheckpointOperation, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): LoadCheckpointOperation;
    static deserializeBinaryFromReader(message: LoadCheckpointOperation, reader: jspb.BinaryReader): LoadCheckpointOperation;
}

export namespace LoadCheckpointOperation {
    export type AsObject = {
        checkpointId: number,
    }
}

export class TrainerCommand extends jspb.Message { 
    getGetHyperParameters(): boolean;
    setGetHyperParameters(value: boolean): TrainerCommand;
    getGetInteractiveLayers(): boolean;
    setGetInteractiveLayers(value: boolean): TrainerCommand;

    hasGetDataRecords(): boolean;
    clearGetDataRecords(): void;
    getGetDataRecords(): string | undefined;
    setGetDataRecords(value: string): TrainerCommand;

    hasGetSingleLayerInfoId(): boolean;
    clearGetSingleLayerInfoId(): void;
    getGetSingleLayerInfoId(): number | undefined;
    setGetSingleLayerInfoId(value: number): TrainerCommand;

    hasHyperParameterChange(): boolean;
    clearHyperParameterChange(): void;
    getHyperParameterChange(): HyperParameterCommand | undefined;
    setHyperParameterChange(value?: HyperParameterCommand): TrainerCommand;

    hasDenySamplesOperation(): boolean;
    clearDenySamplesOperation(): void;
    getDenySamplesOperation(): DenySamplesOperation | undefined;
    setDenySamplesOperation(value?: DenySamplesOperation): TrainerCommand;

    hasDenyEvalSamplesOperation(): boolean;
    clearDenyEvalSamplesOperation(): void;
    getDenyEvalSamplesOperation(): DenySamplesOperation | undefined;
    setDenyEvalSamplesOperation(value?: DenySamplesOperation): TrainerCommand;

    hasLoadCheckpointOperation(): boolean;
    clearLoadCheckpointOperation(): void;
    getLoadCheckpointOperation(): LoadCheckpointOperation | undefined;
    setLoadCheckpointOperation(value?: LoadCheckpointOperation): TrainerCommand;

    hasRemoveFromDenylistOperation(): boolean;
    clearRemoveFromDenylistOperation(): void;
    getRemoveFromDenylistOperation(): DenySamplesOperation | undefined;
    setRemoveFromDenylistOperation(value?: DenySamplesOperation): TrainerCommand;

    hasRemoveEvalFromDenylistOperation(): boolean;
    clearRemoveEvalFromDenylistOperation(): void;
    getRemoveEvalFromDenylistOperation(): DenySamplesOperation | undefined;
    setRemoveEvalFromDenylistOperation(value?: DenySamplesOperation): TrainerCommand;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TrainerCommand.AsObject;
    static toObject(includeInstance: boolean, msg: TrainerCommand): TrainerCommand.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TrainerCommand, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TrainerCommand;
    static deserializeBinaryFromReader(message: TrainerCommand, reader: jspb.BinaryReader): TrainerCommand;
}

export namespace TrainerCommand {
    export type AsObject = {
        getHyperParameters: boolean,
        getInteractiveLayers: boolean,
        getDataRecords?: string,
        getSingleLayerInfoId?: number,
        hyperParameterChange?: HyperParameterCommand.AsObject,
        denySamplesOperation?: DenySamplesOperation.AsObject,
        denyEvalSamplesOperation?: DenySamplesOperation.AsObject,
        loadCheckpointOperation?: LoadCheckpointOperation.AsObject,
        removeFromDenylistOperation?: DenySamplesOperation.AsObject,
        removeEvalFromDenylistOperation?: DenySamplesOperation.AsObject,
    }
}

export class HyperParameterDesc extends jspb.Message { 
    getLabel(): string;
    setLabel(value: string): HyperParameterDesc;
    getName(): string;
    setName(value: string): HyperParameterDesc;
    getType(): string;
    setType(value: string): HyperParameterDesc;

    hasNumericalValue(): boolean;
    clearNumericalValue(): void;
    getNumericalValue(): number | undefined;
    setNumericalValue(value: number): HyperParameterDesc;

    hasStringValue(): boolean;
    clearStringValue(): void;
    getStringValue(): string | undefined;
    setStringValue(value: string): HyperParameterDesc;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): HyperParameterDesc.AsObject;
    static toObject(includeInstance: boolean, msg: HyperParameterDesc): HyperParameterDesc.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: HyperParameterDesc, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): HyperParameterDesc;
    static deserializeBinaryFromReader(message: HyperParameterDesc, reader: jspb.BinaryReader): HyperParameterDesc;
}

export namespace HyperParameterDesc {
    export type AsObject = {
        label: string,
        name: string,
        type: string,
        numericalValue?: number,
        stringValue?: string,
    }
}

export class NeuronStatistics extends jspb.Message { 

    hasNeuronId(): boolean;
    clearNeuronId(): void;
    getNeuronId(): NeuronId | undefined;
    setNeuronId(value?: NeuronId): NeuronStatistics;

    hasNeuronAge(): boolean;
    clearNeuronAge(): void;
    getNeuronAge(): number | undefined;
    setNeuronAge(value: number): NeuronStatistics;

    hasTrainTriggerRate(): boolean;
    clearTrainTriggerRate(): void;
    getTrainTriggerRate(): number | undefined;
    setTrainTriggerRate(value: number): NeuronStatistics;

    hasEvalTriggerRate(): boolean;
    clearEvalTriggerRate(): void;
    getEvalTriggerRate(): number | undefined;
    setEvalTriggerRate(value: number): NeuronStatistics;

    hasLearningRate(): boolean;
    clearLearningRate(): void;
    getLearningRate(): number | undefined;
    setLearningRate(value: number): NeuronStatistics;

    getIncomingLrMap(): jspb.Map<number, number>;
    clearIncomingLrMap(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NeuronStatistics.AsObject;
    static toObject(includeInstance: boolean, msg: NeuronStatistics): NeuronStatistics.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NeuronStatistics, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NeuronStatistics;
    static deserializeBinaryFromReader(message: NeuronStatistics, reader: jspb.BinaryReader): NeuronStatistics;
}

export namespace NeuronStatistics {
    export type AsObject = {
        neuronId?: NeuronId.AsObject,
        neuronAge?: number,
        trainTriggerRate?: number,
        evalTriggerRate?: number,
        learningRate?: number,

        incomingLrMap: Array<[number, number]>,
    }
}

export class LayerRepresentation extends jspb.Message { 

    hasLayerId(): boolean;
    clearLayerId(): void;
    getLayerId(): number | undefined;
    setLayerId(value: number): LayerRepresentation;

    hasLayerName(): boolean;
    clearLayerName(): void;
    getLayerName(): string | undefined;
    setLayerName(value: string): LayerRepresentation;

    hasLayerType(): boolean;
    clearLayerType(): void;
    getLayerType(): string | undefined;
    setLayerType(value: string): LayerRepresentation;

    hasNeuronsCount(): boolean;
    clearNeuronsCount(): void;
    getNeuronsCount(): number | undefined;
    setNeuronsCount(value: number): LayerRepresentation;

    hasIncomingNeuronsCount(): boolean;
    clearIncomingNeuronsCount(): void;
    getIncomingNeuronsCount(): number | undefined;
    setIncomingNeuronsCount(value: number): LayerRepresentation;

    hasKernelSize(): boolean;
    clearKernelSize(): void;
    getKernelSize(): number | undefined;
    setKernelSize(value: number): LayerRepresentation;

    hasStride(): boolean;
    clearStride(): void;
    getStride(): number | undefined;
    setStride(value: number): LayerRepresentation;
    clearNeuronsStatisticsList(): void;
    getNeuronsStatisticsList(): Array<NeuronStatistics>;
    setNeuronsStatisticsList(value: Array<NeuronStatistics>): LayerRepresentation;
    addNeuronsStatistics(value?: NeuronStatistics, index?: number): NeuronStatistics;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): LayerRepresentation.AsObject;
    static toObject(includeInstance: boolean, msg: LayerRepresentation): LayerRepresentation.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: LayerRepresentation, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): LayerRepresentation;
    static deserializeBinaryFromReader(message: LayerRepresentation, reader: jspb.BinaryReader): LayerRepresentation;
}

export namespace LayerRepresentation {
    export type AsObject = {
        layerId?: number,
        layerName?: string,
        layerType?: string,
        neuronsCount?: number,
        incomingNeuronsCount?: number,
        kernelSize?: number,
        stride?: number,
        neuronsStatisticsList: Array<NeuronStatistics.AsObject>,
    }
}

export class ActivationRequest extends jspb.Message { 
    getLayerId(): number;
    setLayerId(value: number): ActivationRequest;
    getSampleId(): number;
    setSampleId(value: number): ActivationRequest;
    getOrigin(): string;
    setOrigin(value: string): ActivationRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ActivationRequest.AsObject;
    static toObject(includeInstance: boolean, msg: ActivationRequest): ActivationRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ActivationRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ActivationRequest;
    static deserializeBinaryFromReader(message: ActivationRequest, reader: jspb.BinaryReader): ActivationRequest;
}

export namespace ActivationRequest {
    export type AsObject = {
        layerId: number,
        sampleId: number,
        origin: string,
    }
}

export class ActivationMap extends jspb.Message { 
    getNeuronId(): number;
    setNeuronId(value: number): ActivationMap;
    clearValuesList(): void;
    getValuesList(): Array<number>;
    setValuesList(value: Array<number>): ActivationMap;
    addValues(value: number, index?: number): number;
    getH(): number;
    setH(value: number): ActivationMap;
    getW(): number;
    setW(value: number): ActivationMap;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ActivationMap.AsObject;
    static toObject(includeInstance: boolean, msg: ActivationMap): ActivationMap.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ActivationMap, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ActivationMap;
    static deserializeBinaryFromReader(message: ActivationMap, reader: jspb.BinaryReader): ActivationMap;
}

export namespace ActivationMap {
    export type AsObject = {
        neuronId: number,
        valuesList: Array<number>,
        h: number,
        w: number,
    }
}

export class ActivationResponse extends jspb.Message { 
    getLayerType(): string;
    setLayerType(value: string): ActivationResponse;
    getNeuronsCount(): number;
    setNeuronsCount(value: number): ActivationResponse;
    clearActivationsList(): void;
    getActivationsList(): Array<ActivationMap>;
    setActivationsList(value: Array<ActivationMap>): ActivationResponse;
    addActivations(value?: ActivationMap, index?: number): ActivationMap;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ActivationResponse.AsObject;
    static toObject(includeInstance: boolean, msg: ActivationResponse): ActivationResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ActivationResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ActivationResponse;
    static deserializeBinaryFromReader(message: ActivationResponse, reader: jspb.BinaryReader): ActivationResponse;
}

export namespace ActivationResponse {
    export type AsObject = {
        layerType: string,
        neuronsCount: number,
        activationsList: Array<ActivationMap.AsObject>,
    }
}

export class TaskField extends jspb.Message { 
    getName(): string;
    setName(value: string): TaskField;

    hasFloatValue(): boolean;
    clearFloatValue(): void;
    getFloatValue(): number;
    setFloatValue(value: number): TaskField;

    hasIntValue(): boolean;
    clearIntValue(): void;
    getIntValue(): number;
    setIntValue(value: number): TaskField;

    hasStringValue(): boolean;
    clearStringValue(): void;
    getStringValue(): string;
    setStringValue(value: string): TaskField;

    hasBytesValue(): boolean;
    clearBytesValue(): void;
    getBytesValue(): Uint8Array | string;
    getBytesValue_asU8(): Uint8Array;
    getBytesValue_asB64(): string;
    setBytesValue(value: Uint8Array | string): TaskField;

    hasBoolValue(): boolean;
    clearBoolValue(): void;
    getBoolValue(): boolean;
    setBoolValue(value: boolean): TaskField;

    getValueCase(): TaskField.ValueCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TaskField.AsObject;
    static toObject(includeInstance: boolean, msg: TaskField): TaskField.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TaskField, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TaskField;
    static deserializeBinaryFromReader(message: TaskField, reader: jspb.BinaryReader): TaskField;
}

export namespace TaskField {
    export type AsObject = {
        name: string,
        floatValue: number,
        intValue: number,
        stringValue: string,
        bytesValue: Uint8Array | string,
        boolValue: boolean,
    }

    export enum ValueCase {
        VALUE_NOT_SET = 0,
        FLOAT_VALUE = 2,
        INT_VALUE = 3,
        STRING_VALUE = 4,
        BYTES_VALUE = 5,
        BOOL_VALUE = 6,
    }

}

export class RecordMetadata extends jspb.Message { 
    getSampleId(): number;
    setSampleId(value: number): RecordMetadata;
    clearSampleLabelList(): void;
    getSampleLabelList(): Array<number>;
    setSampleLabelList(value: Array<number>): RecordMetadata;
    addSampleLabel(value: number, index?: number): number;
    clearSamplePredictionList(): void;
    getSamplePredictionList(): Array<number>;
    setSamplePredictionList(value: Array<number>): RecordMetadata;
    addSamplePrediction(value: number, index?: number): number;
    getSampleLastLoss(): number;
    setSampleLastLoss(value: number): RecordMetadata;
    getSampleEncounters(): number;
    setSampleEncounters(value: number): RecordMetadata;
    getSampleDiscarded(): boolean;
    setSampleDiscarded(value: boolean): RecordMetadata;
    clearExtraFieldsList(): void;
    getExtraFieldsList(): Array<TaskField>;
    setExtraFieldsList(value: Array<TaskField>): RecordMetadata;
    addExtraFields(value?: TaskField, index?: number): TaskField;
    getPredictionRaw(): Uint8Array | string;
    getPredictionRaw_asU8(): Uint8Array;
    getPredictionRaw_asB64(): string;
    setPredictionRaw(value: Uint8Array | string): RecordMetadata;
    getTaskType(): string;
    setTaskType(value: string): RecordMetadata;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RecordMetadata.AsObject;
    static toObject(includeInstance: boolean, msg: RecordMetadata): RecordMetadata.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RecordMetadata, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RecordMetadata;
    static deserializeBinaryFromReader(message: RecordMetadata, reader: jspb.BinaryReader): RecordMetadata;
}

export namespace RecordMetadata {
    export type AsObject = {
        sampleId: number,
        sampleLabelList: Array<number>,
        samplePredictionList: Array<number>,
        sampleLastLoss: number,
        sampleEncounters: number,
        sampleDiscarded: boolean,
        extraFieldsList: Array<TaskField.AsObject>,
        predictionRaw: Uint8Array | string,
        taskType: string,
    }
}

export class SampleStatistics extends jspb.Message { 

    hasOrigin(): boolean;
    clearOrigin(): void;
    getOrigin(): string | undefined;
    setOrigin(value: string): SampleStatistics;

    hasSampleCount(): boolean;
    clearSampleCount(): void;
    getSampleCount(): number | undefined;
    setSampleCount(value: number): SampleStatistics;
    getTaskType(): string;
    setTaskType(value: string): SampleStatistics;
    clearRecordsList(): void;
    getRecordsList(): Array<RecordMetadata>;
    setRecordsList(value: Array<RecordMetadata>): SampleStatistics;
    addRecords(value?: RecordMetadata, index?: number): RecordMetadata;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SampleStatistics.AsObject;
    static toObject(includeInstance: boolean, msg: SampleStatistics): SampleStatistics.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SampleStatistics, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SampleStatistics;
    static deserializeBinaryFromReader(message: SampleStatistics, reader: jspb.BinaryReader): SampleStatistics;
}

export namespace SampleStatistics {
    export type AsObject = {
        origin?: string,
        sampleCount?: number,
        taskType: string,
        recordsList: Array<RecordMetadata.AsObject>,
    }
}

export class CommandResponse extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): CommandResponse;
    getMessage(): string;
    setMessage(value: string): CommandResponse;
    clearHyperParametersDescsList(): void;
    getHyperParametersDescsList(): Array<HyperParameterDesc>;
    setHyperParametersDescsList(value: Array<HyperParameterDesc>): CommandResponse;
    addHyperParametersDescs(value?: HyperParameterDesc, index?: number): HyperParameterDesc;
    clearLayerRepresentationsList(): void;
    getLayerRepresentationsList(): Array<LayerRepresentation>;
    setLayerRepresentationsList(value: Array<LayerRepresentation>): CommandResponse;
    addLayerRepresentations(value?: LayerRepresentation, index?: number): LayerRepresentation;

    hasSampleStatistics(): boolean;
    clearSampleStatistics(): void;
    getSampleStatistics(): SampleStatistics | undefined;
    setSampleStatistics(value?: SampleStatistics): CommandResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CommandResponse.AsObject;
    static toObject(includeInstance: boolean, msg: CommandResponse): CommandResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CommandResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CommandResponse;
    static deserializeBinaryFromReader(message: CommandResponse, reader: jspb.BinaryReader): CommandResponse;
}

export namespace CommandResponse {
    export type AsObject = {
        success: boolean,
        message: string,
        hyperParametersDescsList: Array<HyperParameterDesc.AsObject>,
        layerRepresentationsList: Array<LayerRepresentation.AsObject>,
        sampleStatistics?: SampleStatistics.AsObject,
    }
}

export class SampleRequest extends jspb.Message { 

    hasSampleId(): boolean;
    clearSampleId(): void;
    getSampleId(): number | undefined;
    setSampleId(value: number): SampleRequest;

    hasOrigin(): boolean;
    clearOrigin(): void;
    getOrigin(): string | undefined;
    setOrigin(value: string): SampleRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SampleRequest.AsObject;
    static toObject(includeInstance: boolean, msg: SampleRequest): SampleRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SampleRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SampleRequest;
    static deserializeBinaryFromReader(message: SampleRequest, reader: jspb.BinaryReader): SampleRequest;
}

export namespace SampleRequest {
    export type AsObject = {
        sampleId?: number,
        origin?: string,
    }
}

export class SampleRequestResponse extends jspb.Message { 

    hasSampleId(): boolean;
    clearSampleId(): void;
    getSampleId(): number | undefined;
    setSampleId(value: number): SampleRequestResponse;

    hasOrigin(): boolean;
    clearOrigin(): void;
    getOrigin(): string | undefined;
    setOrigin(value: string): SampleRequestResponse;

    hasLabel(): boolean;
    clearLabel(): void;
    getLabel(): number | undefined;
    setLabel(value: number): SampleRequestResponse;

    hasData(): boolean;
    clearData(): void;
    getData(): Uint8Array | string;
    getData_asU8(): Uint8Array;
    getData_asB64(): string;
    setData(value: Uint8Array | string): SampleRequestResponse;

    hasErrorMessage(): boolean;
    clearErrorMessage(): void;
    getErrorMessage(): string | undefined;
    setErrorMessage(value: string): SampleRequestResponse;

    hasRawData(): boolean;
    clearRawData(): void;
    getRawData(): Uint8Array | string;
    getRawData_asU8(): Uint8Array;
    getRawData_asB64(): string;
    setRawData(value: Uint8Array | string): SampleRequestResponse;

    hasMask(): boolean;
    clearMask(): void;
    getMask(): Uint8Array | string;
    getMask_asU8(): Uint8Array;
    getMask_asB64(): string;
    setMask(value: Uint8Array | string): SampleRequestResponse;

    hasPrediction(): boolean;
    clearPrediction(): void;
    getPrediction(): Uint8Array | string;
    getPrediction_asU8(): Uint8Array;
    getPrediction_asB64(): string;
    setPrediction(value: Uint8Array | string): SampleRequestResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SampleRequestResponse.AsObject;
    static toObject(includeInstance: boolean, msg: SampleRequestResponse): SampleRequestResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SampleRequestResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SampleRequestResponse;
    static deserializeBinaryFromReader(message: SampleRequestResponse, reader: jspb.BinaryReader): SampleRequestResponse;
}

export namespace SampleRequestResponse {
    export type AsObject = {
        sampleId?: number,
        origin?: string,
        label?: number,
        data: Uint8Array | string,
        errorMessage?: string,
        rawData: Uint8Array | string,
        mask: Uint8Array | string,
        prediction: Uint8Array | string,
    }
}

export class BatchSampleRequest extends jspb.Message { 
    clearSampleIdsList(): void;
    getSampleIdsList(): Array<number>;
    setSampleIdsList(value: Array<number>): BatchSampleRequest;
    addSampleIds(value: number, index?: number): number;
    getOrigin(): string;
    setOrigin(value: string): BatchSampleRequest;

    hasResizeWidth(): boolean;
    clearResizeWidth(): void;
    getResizeWidth(): number | undefined;
    setResizeWidth(value: number): BatchSampleRequest;

    hasResizeHeight(): boolean;
    clearResizeHeight(): void;
    getResizeHeight(): number | undefined;
    setResizeHeight(value: number): BatchSampleRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): BatchSampleRequest.AsObject;
    static toObject(includeInstance: boolean, msg: BatchSampleRequest): BatchSampleRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: BatchSampleRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): BatchSampleRequest;
    static deserializeBinaryFromReader(message: BatchSampleRequest, reader: jspb.BinaryReader): BatchSampleRequest;
}

export namespace BatchSampleRequest {
    export type AsObject = {
        sampleIdsList: Array<number>,
        origin: string,
        resizeWidth?: number,
        resizeHeight?: number,
    }
}

export class BatchSampleResponse extends jspb.Message { 
    clearSamplesList(): void;
    getSamplesList(): Array<SampleRequestResponse>;
    setSamplesList(value: Array<SampleRequestResponse>): BatchSampleResponse;
    addSamples(value?: SampleRequestResponse, index?: number): SampleRequestResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): BatchSampleResponse.AsObject;
    static toObject(includeInstance: boolean, msg: BatchSampleResponse): BatchSampleResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: BatchSampleResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): BatchSampleResponse;
    static deserializeBinaryFromReader(message: BatchSampleResponse, reader: jspb.BinaryReader): BatchSampleResponse;
}

export namespace BatchSampleResponse {
    export type AsObject = {
        samplesList: Array<SampleRequestResponse.AsObject>,
    }
}

export class WeightsRequest extends jspb.Message { 

    hasNeuronId(): boolean;
    clearNeuronId(): void;
    getNeuronId(): NeuronId | undefined;
    setNeuronId(value?: NeuronId): WeightsRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): WeightsRequest.AsObject;
    static toObject(includeInstance: boolean, msg: WeightsRequest): WeightsRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: WeightsRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): WeightsRequest;
    static deserializeBinaryFromReader(message: WeightsRequest, reader: jspb.BinaryReader): WeightsRequest;
}

export namespace WeightsRequest {
    export type AsObject = {
        neuronId?: NeuronId.AsObject,
    }
}

export class WeightsResponse extends jspb.Message { 

    hasNeuronId(): boolean;
    clearNeuronId(): void;
    getNeuronId(): NeuronId | undefined;
    setNeuronId(value?: NeuronId): WeightsResponse;

    hasLayerName(): boolean;
    clearLayerName(): void;
    getLayerName(): string | undefined;
    setLayerName(value: string): WeightsResponse;

    hasLayerType(): boolean;
    clearLayerType(): void;
    getLayerType(): string | undefined;
    setLayerType(value: string): WeightsResponse;
    getIncoming(): number;
    setIncoming(value: number): WeightsResponse;
    getOutgoing(): number;
    setOutgoing(value: number): WeightsResponse;

    hasKernelSize(): boolean;
    clearKernelSize(): void;
    getKernelSize(): number | undefined;
    setKernelSize(value: number): WeightsResponse;
    clearWeightsList(): void;
    getWeightsList(): Array<number>;
    setWeightsList(value: Array<number>): WeightsResponse;
    addWeights(value: number, index?: number): number;
    getSuccess(): boolean;
    setSuccess(value: boolean): WeightsResponse;

    hasErrorMessage(): boolean;
    clearErrorMessage(): void;
    getErrorMessage(): string | undefined;
    setErrorMessage(value: string): WeightsResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): WeightsResponse.AsObject;
    static toObject(includeInstance: boolean, msg: WeightsResponse): WeightsResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: WeightsResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): WeightsResponse;
    static deserializeBinaryFromReader(message: WeightsResponse, reader: jspb.BinaryReader): WeightsResponse;
}

export namespace WeightsResponse {
    export type AsObject = {
        neuronId?: NeuronId.AsObject,
        layerName?: string,
        layerType?: string,
        incoming: number,
        outgoing: number,
        kernelSize?: number,
        weightsList: Array<number>,
        success: boolean,
        errorMessage?: string,
    }
}

export class DataQueryRequest extends jspb.Message { 
    getQuery(): string;
    setQuery(value: string): DataQueryRequest;
    getAccumulate(): boolean;
    setAccumulate(value: boolean): DataQueryRequest;
    getIsNaturalLanguage(): boolean;
    setIsNaturalLanguage(value: boolean): DataQueryRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataQueryRequest.AsObject;
    static toObject(includeInstance: boolean, msg: DataQueryRequest): DataQueryRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataQueryRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataQueryRequest;
    static deserializeBinaryFromReader(message: DataQueryRequest, reader: jspb.BinaryReader): DataQueryRequest;
}

export namespace DataQueryRequest {
    export type AsObject = {
        query: string,
        accumulate: boolean,
        isNaturalLanguage: boolean,
    }
}

export class DataQueryResponse extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): DataQueryResponse;
    getMessage(): string;
    setMessage(value: string): DataQueryResponse;
    getNumberOfAllSamples(): number;
    setNumberOfAllSamples(value: number): DataQueryResponse;
    getNumberOfSamplesInTheLoop(): number;
    setNumberOfSamplesInTheLoop(value: number): DataQueryResponse;
    getNumberOfDiscardedSamples(): number;
    setNumberOfDiscardedSamples(value: number): DataQueryResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataQueryResponse.AsObject;
    static toObject(includeInstance: boolean, msg: DataQueryResponse): DataQueryResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataQueryResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataQueryResponse;
    static deserializeBinaryFromReader(message: DataQueryResponse, reader: jspb.BinaryReader): DataQueryResponse;
}

export namespace DataQueryResponse {
    export type AsObject = {
        success: boolean,
        message: string,
        numberOfAllSamples: number,
        numberOfSamplesInTheLoop: number,
        numberOfDiscardedSamples: number,
    }
}

export class DataSamplesRequest extends jspb.Message { 
    getStartIndex(): number;
    setStartIndex(value: number): DataSamplesRequest;
    getRecordsCnt(): number;
    setRecordsCnt(value: number): DataSamplesRequest;
    getIncludeTransformedData(): boolean;
    setIncludeTransformedData(value: boolean): DataSamplesRequest;
    getIncludeRawData(): boolean;
    setIncludeRawData(value: boolean): DataSamplesRequest;
    clearStatsToRetrieveList(): void;
    getStatsToRetrieveList(): Array<string>;
    setStatsToRetrieveList(value: Array<string>): DataSamplesRequest;
    addStatsToRetrieve(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataSamplesRequest.AsObject;
    static toObject(includeInstance: boolean, msg: DataSamplesRequest): DataSamplesRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataSamplesRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataSamplesRequest;
    static deserializeBinaryFromReader(message: DataSamplesRequest, reader: jspb.BinaryReader): DataSamplesRequest;
}

export namespace DataSamplesRequest {
    export type AsObject = {
        startIndex: number,
        recordsCnt: number,
        includeTransformedData: boolean,
        includeRawData: boolean,
        statsToRetrieveList: Array<string>,
    }
}

export class DataStat extends jspb.Message { 
    getName(): string;
    setName(value: string): DataStat;
    getType(): string;
    setType(value: string): DataStat;
    clearShapeList(): void;
    getShapeList(): Array<number>;
    setShapeList(value: Array<number>): DataStat;
    addShape(value: number, index?: number): number;
    clearValueList(): void;
    getValueList(): Array<number>;
    setValueList(value: Array<number>): DataStat;
    addValue(value: number, index?: number): number;
    getValueString(): string;
    setValueString(value: string): DataStat;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataStat.AsObject;
    static toObject(includeInstance: boolean, msg: DataStat): DataStat.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataStat, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataStat;
    static deserializeBinaryFromReader(message: DataStat, reader: jspb.BinaryReader): DataStat;
}

export namespace DataStat {
    export type AsObject = {
        name: string,
        type: string,
        shapeList: Array<number>,
        valueList: Array<number>,
        valueString: string,
    }
}

export class DataRecord extends jspb.Message { 
    getSampleId(): number;
    setSampleId(value: number): DataRecord;
    clearDataStatsList(): void;
    getDataStatsList(): Array<DataStat>;
    setDataStatsList(value: Array<DataStat>): DataRecord;
    addDataStats(value?: DataStat, index?: number): DataStat;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataRecord.AsObject;
    static toObject(includeInstance: boolean, msg: DataRecord): DataRecord.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataRecord, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataRecord;
    static deserializeBinaryFromReader(message: DataRecord, reader: jspb.BinaryReader): DataRecord;
}

export namespace DataRecord {
    export type AsObject = {
        sampleId: number,
        dataStatsList: Array<DataStat.AsObject>,
    }
}

export class DataSamplesResponse extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): DataSamplesResponse;
    getMessage(): string;
    setMessage(value: string): DataSamplesResponse;
    clearDataRecordsList(): void;
    getDataRecordsList(): Array<DataRecord>;
    setDataRecordsList(value: Array<DataRecord>): DataSamplesResponse;
    addDataRecords(value?: DataRecord, index?: number): DataRecord;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataSamplesResponse.AsObject;
    static toObject(includeInstance: boolean, msg: DataSamplesResponse): DataSamplesResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataSamplesResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataSamplesResponse;
    static deserializeBinaryFromReader(message: DataSamplesResponse, reader: jspb.BinaryReader): DataSamplesResponse;
}

export namespace DataSamplesResponse {
    export type AsObject = {
        success: boolean,
        message: string,
        dataRecordsList: Array<DataRecord.AsObject>,
    }
}

export class DataEditsRequest extends jspb.Message { 
    getStatName(): string;
    setStatName(value: string): DataEditsRequest;
    getFloatValue(): number;
    setFloatValue(value: number): DataEditsRequest;
    getStringValue(): string;
    setStringValue(value: string): DataEditsRequest;
    getBoolValue(): boolean;
    setBoolValue(value: boolean): DataEditsRequest;
    getType(): SampleEditType;
    setType(value: SampleEditType): DataEditsRequest;
    clearSamplesIdsList(): void;
    getSamplesIdsList(): Array<number>;
    setSamplesIdsList(value: Array<number>): DataEditsRequest;
    addSamplesIds(value: number, index?: number): number;
    clearSampleOriginsList(): void;
    getSampleOriginsList(): Array<string>;
    setSampleOriginsList(value: Array<string>): DataEditsRequest;
    addSampleOrigins(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataEditsRequest.AsObject;
    static toObject(includeInstance: boolean, msg: DataEditsRequest): DataEditsRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataEditsRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataEditsRequest;
    static deserializeBinaryFromReader(message: DataEditsRequest, reader: jspb.BinaryReader): DataEditsRequest;
}

export namespace DataEditsRequest {
    export type AsObject = {
        statName: string,
        floatValue: number,
        stringValue: string,
        boolValue: boolean,
        type: SampleEditType,
        samplesIdsList: Array<number>,
        sampleOriginsList: Array<string>,
    }
}

export class DataEditsResponse extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): DataEditsResponse;
    getMessage(): string;
    setMessage(value: string): DataEditsResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): DataEditsResponse.AsObject;
    static toObject(includeInstance: boolean, msg: DataEditsResponse): DataEditsResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: DataEditsResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): DataEditsResponse;
    static deserializeBinaryFromReader(message: DataEditsResponse, reader: jspb.BinaryReader): DataEditsResponse;
}

export namespace DataEditsResponse {
    export type AsObject = {
        success: boolean,
        message: string,
    }
}

export enum WeightOperationType {
    ZEROFY = 0,
    REINITIALIZE = 1,
    FREEZE = 2,
    REMOVE_NEURONS = 9,
    ADD_NEURONS = 10,
}

export enum ZerofyPredicate {
    ZEROFY_PREDICATE_NONE = 0,
    ZEROFY_PREDICATE_WITH_FROZEN = 1,
    ZEROFY_PREDICATE_WITH_OLDER = 2,
}

export enum SampleEditType {
    EDIT_OVERRIDE = 0,
    EDIT_ACCUMULATE = 1,
}
