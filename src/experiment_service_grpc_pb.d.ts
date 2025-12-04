// package: 
// file: experiment_service.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "grpc";
import * as experiment_service_pb from "./experiment_service_pb";

interface IExperimentServiceService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    streamStatus: IExperimentServiceService_IStreamStatus;
    experimentCommand: IExperimentServiceService_IExperimentCommand;
    manipulateWeights: IExperimentServiceService_IManipulateWeights;
    getWeights: IExperimentServiceService_IGetWeights;
    getActivations: IExperimentServiceService_IGetActivations;
    getSamples: IExperimentServiceService_IGetSamples;
    applyDataQuery: IExperimentServiceService_IApplyDataQuery;
    getDataSamples: IExperimentServiceService_IGetDataSamples;
    editDataSample: IExperimentServiceService_IEditDataSample;
}

interface IExperimentServiceService_IStreamStatus extends grpc.MethodDefinition<experiment_service_pb.Empty, experiment_service_pb.TrainingStatusEx> {
    path: "/ExperimentService/StreamStatus";
    requestStream: false;
    responseStream: true;
    requestSerialize: grpc.serialize<experiment_service_pb.Empty>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.Empty>;
    responseSerialize: grpc.serialize<experiment_service_pb.TrainingStatusEx>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.TrainingStatusEx>;
}
interface IExperimentServiceService_IExperimentCommand extends grpc.MethodDefinition<experiment_service_pb.TrainerCommand, experiment_service_pb.CommandResponse> {
    path: "/ExperimentService/ExperimentCommand";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.TrainerCommand>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.TrainerCommand>;
    responseSerialize: grpc.serialize<experiment_service_pb.CommandResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.CommandResponse>;
}
interface IExperimentServiceService_IManipulateWeights extends grpc.MethodDefinition<experiment_service_pb.WeightsOperationRequest, experiment_service_pb.WeightsOperationResponse> {
    path: "/ExperimentService/ManipulateWeights";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.WeightsOperationRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.WeightsOperationRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.WeightsOperationResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.WeightsOperationResponse>;
}
interface IExperimentServiceService_IGetWeights extends grpc.MethodDefinition<experiment_service_pb.WeightsRequest, experiment_service_pb.WeightsResponse> {
    path: "/ExperimentService/GetWeights";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.WeightsRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.WeightsRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.WeightsResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.WeightsResponse>;
}
interface IExperimentServiceService_IGetActivations extends grpc.MethodDefinition<experiment_service_pb.ActivationRequest, experiment_service_pb.ActivationResponse> {
    path: "/ExperimentService/GetActivations";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.ActivationRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.ActivationRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.ActivationResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.ActivationResponse>;
}
interface IExperimentServiceService_IGetSamples extends grpc.MethodDefinition<experiment_service_pb.BatchSampleRequest, experiment_service_pb.BatchSampleResponse> {
    path: "/ExperimentService/GetSamples";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.BatchSampleRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.BatchSampleRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.BatchSampleResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.BatchSampleResponse>;
}
interface IExperimentServiceService_IApplyDataQuery extends grpc.MethodDefinition<experiment_service_pb.DataQueryRequest, experiment_service_pb.DataQueryResponse> {
    path: "/ExperimentService/ApplyDataQuery";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.DataQueryRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.DataQueryRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.DataQueryResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.DataQueryResponse>;
}
interface IExperimentServiceService_IGetDataSamples extends grpc.MethodDefinition<experiment_service_pb.DataSamplesRequest, experiment_service_pb.DataSamplesResponse> {
    path: "/ExperimentService/GetDataSamples";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.DataSamplesRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.DataSamplesRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.DataSamplesResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.DataSamplesResponse>;
}
interface IExperimentServiceService_IEditDataSample extends grpc.MethodDefinition<experiment_service_pb.DataEditsRequest, experiment_service_pb.DataEditsResponse> {
    path: "/ExperimentService/EditDataSample";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<experiment_service_pb.DataEditsRequest>;
    requestDeserialize: grpc.deserialize<experiment_service_pb.DataEditsRequest>;
    responseSerialize: grpc.serialize<experiment_service_pb.DataEditsResponse>;
    responseDeserialize: grpc.deserialize<experiment_service_pb.DataEditsResponse>;
}

export const ExperimentServiceService: IExperimentServiceService;

export interface IExperimentServiceServer {
    streamStatus: grpc.handleServerStreamingCall<experiment_service_pb.Empty, experiment_service_pb.TrainingStatusEx>;
    experimentCommand: grpc.handleUnaryCall<experiment_service_pb.TrainerCommand, experiment_service_pb.CommandResponse>;
    manipulateWeights: grpc.handleUnaryCall<experiment_service_pb.WeightsOperationRequest, experiment_service_pb.WeightsOperationResponse>;
    getWeights: grpc.handleUnaryCall<experiment_service_pb.WeightsRequest, experiment_service_pb.WeightsResponse>;
    getActivations: grpc.handleUnaryCall<experiment_service_pb.ActivationRequest, experiment_service_pb.ActivationResponse>;
    getSamples: grpc.handleUnaryCall<experiment_service_pb.BatchSampleRequest, experiment_service_pb.BatchSampleResponse>;
    applyDataQuery: grpc.handleUnaryCall<experiment_service_pb.DataQueryRequest, experiment_service_pb.DataQueryResponse>;
    getDataSamples: grpc.handleUnaryCall<experiment_service_pb.DataSamplesRequest, experiment_service_pb.DataSamplesResponse>;
    editDataSample: grpc.handleUnaryCall<experiment_service_pb.DataEditsRequest, experiment_service_pb.DataEditsResponse>;
}

export interface IExperimentServiceClient {
    streamStatus(request: experiment_service_pb.Empty, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<experiment_service_pb.TrainingStatusEx>;
    streamStatus(request: experiment_service_pb.Empty, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<experiment_service_pb.TrainingStatusEx>;
    experimentCommand(request: experiment_service_pb.TrainerCommand, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    experimentCommand(request: experiment_service_pb.TrainerCommand, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    experimentCommand(request: experiment_service_pb.TrainerCommand, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    getWeights(request: experiment_service_pb.WeightsRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    getWeights(request: experiment_service_pb.WeightsRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    getWeights(request: experiment_service_pb.WeightsRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    getActivations(request: experiment_service_pb.ActivationRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    getActivations(request: experiment_service_pb.ActivationRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    getActivations(request: experiment_service_pb.ActivationRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    getSamples(request: experiment_service_pb.BatchSampleRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    getSamples(request: experiment_service_pb.BatchSampleRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    getSamples(request: experiment_service_pb.BatchSampleRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    applyDataQuery(request: experiment_service_pb.DataQueryRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    applyDataQuery(request: experiment_service_pb.DataQueryRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    applyDataQuery(request: experiment_service_pb.DataQueryRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    getDataSamples(request: experiment_service_pb.DataSamplesRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    getDataSamples(request: experiment_service_pb.DataSamplesRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    getDataSamples(request: experiment_service_pb.DataSamplesRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    editDataSample(request: experiment_service_pb.DataEditsRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
    editDataSample(request: experiment_service_pb.DataEditsRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
    editDataSample(request: experiment_service_pb.DataEditsRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
}

export class ExperimentServiceClient extends grpc.Client implements IExperimentServiceClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
    public streamStatus(request: experiment_service_pb.Empty, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<experiment_service_pb.TrainingStatusEx>;
    public streamStatus(request: experiment_service_pb.Empty, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<experiment_service_pb.TrainingStatusEx>;
    public experimentCommand(request: experiment_service_pb.TrainerCommand, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    public experimentCommand(request: experiment_service_pb.TrainerCommand, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    public experimentCommand(request: experiment_service_pb.TrainerCommand, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.CommandResponse) => void): grpc.ClientUnaryCall;
    public manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    public manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    public manipulateWeights(request: experiment_service_pb.WeightsOperationRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsOperationResponse) => void): grpc.ClientUnaryCall;
    public getWeights(request: experiment_service_pb.WeightsRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    public getWeights(request: experiment_service_pb.WeightsRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    public getWeights(request: experiment_service_pb.WeightsRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.WeightsResponse) => void): grpc.ClientUnaryCall;
    public getActivations(request: experiment_service_pb.ActivationRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    public getActivations(request: experiment_service_pb.ActivationRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    public getActivations(request: experiment_service_pb.ActivationRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.ActivationResponse) => void): grpc.ClientUnaryCall;
    public getSamples(request: experiment_service_pb.BatchSampleRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    public getSamples(request: experiment_service_pb.BatchSampleRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    public getSamples(request: experiment_service_pb.BatchSampleRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.BatchSampleResponse) => void): grpc.ClientUnaryCall;
    public applyDataQuery(request: experiment_service_pb.DataQueryRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    public applyDataQuery(request: experiment_service_pb.DataQueryRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    public applyDataQuery(request: experiment_service_pb.DataQueryRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataQueryResponse) => void): grpc.ClientUnaryCall;
    public getDataSamples(request: experiment_service_pb.DataSamplesRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    public getDataSamples(request: experiment_service_pb.DataSamplesRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    public getDataSamples(request: experiment_service_pb.DataSamplesRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataSamplesResponse) => void): grpc.ClientUnaryCall;
    public editDataSample(request: experiment_service_pb.DataEditsRequest, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
    public editDataSample(request: experiment_service_pb.DataEditsRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
    public editDataSample(request: experiment_service_pb.DataEditsRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: experiment_service_pb.DataEditsResponse) => void): grpc.ClientUnaryCall;
}
