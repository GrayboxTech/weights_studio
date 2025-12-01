// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var experiment_service_pb = require('./experiment_service_pb.js');

function serialize_ActivationRequest(arg) {
  if (!(arg instanceof experiment_service_pb.ActivationRequest)) {
    throw new Error('Expected argument of type ActivationRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_ActivationRequest(buffer_arg) {
  return experiment_service_pb.ActivationRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_ActivationResponse(arg) {
  if (!(arg instanceof experiment_service_pb.ActivationResponse)) {
    throw new Error('Expected argument of type ActivationResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_ActivationResponse(buffer_arg) {
  return experiment_service_pb.ActivationResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_BatchSampleRequest(arg) {
  if (!(arg instanceof experiment_service_pb.BatchSampleRequest)) {
    throw new Error('Expected argument of type BatchSampleRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_BatchSampleRequest(buffer_arg) {
  return experiment_service_pb.BatchSampleRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_BatchSampleResponse(arg) {
  if (!(arg instanceof experiment_service_pb.BatchSampleResponse)) {
    throw new Error('Expected argument of type BatchSampleResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_BatchSampleResponse(buffer_arg) {
  return experiment_service_pb.BatchSampleResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_CommandResponse(arg) {
  if (!(arg instanceof experiment_service_pb.CommandResponse)) {
    throw new Error('Expected argument of type CommandResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_CommandResponse(buffer_arg) {
  return experiment_service_pb.CommandResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataEditsRequest(arg) {
  if (!(arg instanceof experiment_service_pb.DataEditsRequest)) {
    throw new Error('Expected argument of type DataEditsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataEditsRequest(buffer_arg) {
  return experiment_service_pb.DataEditsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataEditsResponse(arg) {
  if (!(arg instanceof experiment_service_pb.DataEditsResponse)) {
    throw new Error('Expected argument of type DataEditsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataEditsResponse(buffer_arg) {
  return experiment_service_pb.DataEditsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataQueryRequest(arg) {
  if (!(arg instanceof experiment_service_pb.DataQueryRequest)) {
    throw new Error('Expected argument of type DataQueryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataQueryRequest(buffer_arg) {
  return experiment_service_pb.DataQueryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataQueryResponse(arg) {
  if (!(arg instanceof experiment_service_pb.DataQueryResponse)) {
    throw new Error('Expected argument of type DataQueryResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataQueryResponse(buffer_arg) {
  return experiment_service_pb.DataQueryResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataSamplesRequest(arg) {
  if (!(arg instanceof experiment_service_pb.DataSamplesRequest)) {
    throw new Error('Expected argument of type DataSamplesRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataSamplesRequest(buffer_arg) {
  return experiment_service_pb.DataSamplesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_DataSamplesResponse(arg) {
  if (!(arg instanceof experiment_service_pb.DataSamplesResponse)) {
    throw new Error('Expected argument of type DataSamplesResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_DataSamplesResponse(buffer_arg) {
  return experiment_service_pb.DataSamplesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Empty(arg) {
  if (!(arg instanceof experiment_service_pb.Empty)) {
    throw new Error('Expected argument of type Empty');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Empty(buffer_arg) {
  return experiment_service_pb.Empty.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_TrainerCommand(arg) {
  if (!(arg instanceof experiment_service_pb.TrainerCommand)) {
    throw new Error('Expected argument of type TrainerCommand');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_TrainerCommand(buffer_arg) {
  return experiment_service_pb.TrainerCommand.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_TrainingStatusEx(arg) {
  if (!(arg instanceof experiment_service_pb.TrainingStatusEx)) {
    throw new Error('Expected argument of type TrainingStatusEx');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_TrainingStatusEx(buffer_arg) {
  return experiment_service_pb.TrainingStatusEx.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_WeightsOperationRequest(arg) {
  if (!(arg instanceof experiment_service_pb.WeightsOperationRequest)) {
    throw new Error('Expected argument of type WeightsOperationRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_WeightsOperationRequest(buffer_arg) {
  return experiment_service_pb.WeightsOperationRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_WeightsOperationResponse(arg) {
  if (!(arg instanceof experiment_service_pb.WeightsOperationResponse)) {
    throw new Error('Expected argument of type WeightsOperationResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_WeightsOperationResponse(buffer_arg) {
  return experiment_service_pb.WeightsOperationResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_WeightsRequest(arg) {
  if (!(arg instanceof experiment_service_pb.WeightsRequest)) {
    throw new Error('Expected argument of type WeightsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_WeightsRequest(buffer_arg) {
  return experiment_service_pb.WeightsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_WeightsResponse(arg) {
  if (!(arg instanceof experiment_service_pb.WeightsResponse)) {
    throw new Error('Expected argument of type WeightsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_WeightsResponse(buffer_arg) {
  return experiment_service_pb.WeightsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var ExperimentServiceService = exports.ExperimentServiceService = {
  streamStatus: {
    path: '/ExperimentService/StreamStatus',
    requestStream: false,
    responseStream: true,
    requestType: experiment_service_pb.Empty,
    responseType: experiment_service_pb.TrainingStatusEx,
    requestSerialize: serialize_Empty,
    requestDeserialize: deserialize_Empty,
    responseSerialize: serialize_TrainingStatusEx,
    responseDeserialize: deserialize_TrainingStatusEx,
  },
  experimentCommand: {
    path: '/ExperimentService/ExperimentCommand',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.TrainerCommand,
    responseType: experiment_service_pb.CommandResponse,
    requestSerialize: serialize_TrainerCommand,
    requestDeserialize: deserialize_TrainerCommand,
    responseSerialize: serialize_CommandResponse,
    responseDeserialize: deserialize_CommandResponse,
  },
  manipulateWeights: {
    path: '/ExperimentService/ManipulateWeights',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.WeightsOperationRequest,
    responseType: experiment_service_pb.WeightsOperationResponse,
    requestSerialize: serialize_WeightsOperationRequest,
    requestDeserialize: deserialize_WeightsOperationRequest,
    responseSerialize: serialize_WeightsOperationResponse,
    responseDeserialize: deserialize_WeightsOperationResponse,
  },
  getWeights: {
    path: '/ExperimentService/GetWeights',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.WeightsRequest,
    responseType: experiment_service_pb.WeightsResponse,
    requestSerialize: serialize_WeightsRequest,
    requestDeserialize: deserialize_WeightsRequest,
    responseSerialize: serialize_WeightsResponse,
    responseDeserialize: deserialize_WeightsResponse,
  },
  getActivations: {
    path: '/ExperimentService/GetActivations',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.ActivationRequest,
    responseType: experiment_service_pb.ActivationResponse,
    requestSerialize: serialize_ActivationRequest,
    requestDeserialize: deserialize_ActivationRequest,
    responseSerialize: serialize_ActivationResponse,
    responseDeserialize: deserialize_ActivationResponse,
  },
  getSamples: {
    path: '/ExperimentService/GetSamples',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.BatchSampleRequest,
    responseType: experiment_service_pb.BatchSampleResponse,
    requestSerialize: serialize_BatchSampleRequest,
    requestDeserialize: deserialize_BatchSampleRequest,
    responseSerialize: serialize_BatchSampleResponse,
    responseDeserialize: deserialize_BatchSampleResponse,
  },
  // Data Service (for weights_studio UI)
applyDataQuery: {
    path: '/ExperimentService/ApplyDataQuery',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.DataQueryRequest,
    responseType: experiment_service_pb.DataQueryResponse,
    requestSerialize: serialize_DataQueryRequest,
    requestDeserialize: deserialize_DataQueryRequest,
    responseSerialize: serialize_DataQueryResponse,
    responseDeserialize: deserialize_DataQueryResponse,
  },
  getDataSamples: {
    path: '/ExperimentService/GetDataSamples',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.DataSamplesRequest,
    responseType: experiment_service_pb.DataSamplesResponse,
    requestSerialize: serialize_DataSamplesRequest,
    requestDeserialize: deserialize_DataSamplesRequest,
    responseSerialize: serialize_DataSamplesResponse,
    responseDeserialize: deserialize_DataSamplesResponse,
  },
  editDataSample: {
    path: '/ExperimentService/EditDataSample',
    requestStream: false,
    responseStream: false,
    requestType: experiment_service_pb.DataEditsRequest,
    responseType: experiment_service_pb.DataEditsResponse,
    requestSerialize: serialize_DataEditsRequest,
    requestDeserialize: deserialize_DataEditsRequest,
    responseSerialize: serialize_DataEditsResponse,
    responseDeserialize: deserialize_DataEditsResponse,
  },
};

exports.ExperimentServiceClient = grpc.makeGenericClientConstructor(ExperimentServiceService, 'ExperimentService');
