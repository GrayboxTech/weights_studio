import argparse
import grpc
import io
import importlib
import logging
import sys
import torch
import traceback

import data_service_pb2 as pb2
import data_service_pb2_grpc as pb2_grpc
import numpy as np
import pandas as pd

from concurrent import futures
from torchvision import transforms
from PIL import Image
from pathlib import Path

from agent import DataManipulationAgent


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
_LOGGER = logging.getLogger(__name__)

_DEFAULT_DATA_SERVICE_PORT = 50051


class DataServiceError(Exception):
    """Raised for errors interacting with the data service agent (Ollama)."""
    pass


class DataServiceServicer(pb2_grpc.DataServiceServicer):

    def __init__(self, experiment):
        _LOGGER.info("Initializing DataServiceServicer")
        super().__init__()

        self.experiment = experiment
        self._all_datasets_df = self._generate_all_datasets_df()
        _LOGGER.info("Generated initial dataframe with %s samples", len(self._all_datasets_df))
        _LOGGER.info("Dataframe columns: %s", self._all_datasets_df.columns.tolist())
        _LOGGER.info("Dataframe shape: %s", self._all_datasets_df.shape)

        # Initialize agent once - schema remains consistent
        self._agent = DataManipulationAgent(self._all_datasets_df)

    def _generate_all_datasets_df(self):
        _LOGGER.info("Generating all datasets dataframe")

        # Get train dataset records and add origin column
        train_df = pd.DataFrame(
            self.experiment.train_loader.dataset.as_records())
        train_df['origin'] = 'train'
        _LOGGER.info("Train dataset: %s samples", len(train_df))

        # Get eval dataset records and add origin column
        eval_df = pd.DataFrame(
            self.experiment.eval_loader.dataset.as_records())
        eval_df['origin'] = 'eval'
        _LOGGER.info("Eval dataset: %s samples", len(eval_df))

        combined_df = pd.concat([train_df, eval_df], ignore_index=True)
        _LOGGER.info("Combined dataframe: %s total samples", len(combined_df))
        _LOGGER.debug("Dataframe head:\n%s", combined_df.head())

        return combined_df

    def ApplyQuery(self, request, context):
        _LOGGER.info("ApplyQuery called with request: %s", request)

        # If query is empty, just return current dataframe info
        if request.query == "":
            _LOGGER.info("Empty query provided, returning current dataframe info")

            # Count samples by status
            total_count = len(self._all_datasets_df)
            discarded_count = len(self._all_datasets_df[
                self._all_datasets_df['deny_listed']])
            
            # print(self._all_datasets_df[
            #     self._all_datasets_df['deny_listed']])
            in_loop_count = total_count - discarded_count

            return pb2.QueryResponse(
                success=True, 
                message=f"Current dataframe has {total_count} samples",
                number_of_all_samples=total_count,
                number_of_samples_in_the_loop=in_loop_count,
                number_of_discarded_samples=discarded_count
            )

        if not request.accumulate:
            _LOGGER.info("Regenerating dataframe (accumulate=False)")
            self._all_datasets_df = self._generate_all_datasets_df()

        _LOGGER.info("Dataframe before query - shape: %s", self._all_datasets_df.shape)
        _LOGGER.debug("Dataframe before query:\n%s", self._all_datasets_df.head())

        try:
            if request.is_natural_language:
                _LOGGER.info("Processing natural language query")
                # Use agent to convert natural language to pandas operation
                operation = self._agent.query(request.query)
                _LOGGER.info("Agent converted query to operation: %s", operation)

                # Apply the operation to the dataframe
                self._all_datasets_df = self._agent.apply_operation(self._all_datasets_df, operation)
                message = f"Applied operation: {operation['function']}"
            else:
                _LOGGER.info("Processing direct pandas query")
                self._all_datasets_df = self._all_datasets_df.query(request.query)
                message = f"Query [{request.query}] applied"
                _LOGGER.info("Direct query applied successfully")

            _LOGGER.info("Dataframe after query - shape: %s", self._all_datasets_df.shape)
            _LOGGER.info("Dataframe columns: %s", self._all_datasets_df.columns.tolist())
            _LOGGER.info("Dataframe after query:\n%s", self._all_datasets_df.head())
            _LOGGER.info("Dataframe statistics:\n%s", self._all_datasets_df.describe())

            # Count samples by status after query
            total_count = len(self._all_datasets_df)
            discarded_count = len(self._all_datasets_df[self._all_datasets_df.get('sample_discarded', False) == True]) if 'sample_discarded' in self._all_datasets_df.columns else 0
            in_loop_count = total_count - discarded_count

            return pb2.QueryResponse(
                success=True, 
                message=message,
                number_of_all_samples=total_count,
                number_of_samples_in_the_loop=in_loop_count,
                number_of_discarded_samples=discarded_count
            )

        except Exception as e:
            _LOGGER.error("Failed to apply query: %s", str(e), exc_info=True)
            return pb2.QueryResponse(
                success=False, 
                message=f"Failed to apply query: {str(e)}")

    def _get_stat_from_row(self, row, stat_name):
        """Extract a stat from dataframe row and convert to DataStat message."""        
        if stat_name not in row or pd.isna(row[stat_name]):
            return None

        value = row[stat_name]
        
        # if stat_name == 'tags':
        #     print("Processing tags for sample_id ", row, " value : ", value)
        # Determine type and shape
        if isinstance(value, (int, float)):
            return pb2.DataStat(
                name=stat_name,
                type='scalar',
                shape=[1],
                value=[float(value)]
            )
        if isinstance(value, str):
            return pb2.DataStat(
                name=stat_name,
                type='string',
                shape=[1],
                value_string=value
            )
        if isinstance(value, (list, np.ndarray)):
            flat_value = np.array(value).flatten()
            return pb2.DataStat(
                name=stat_name,
                type='array',
                shape=list(np.array(value).shape),
                value=flat_value.tolist()
            )

    def _process_sample_row(self, args):
        """Process a single dataframe row to create a DataRecord."""
        row, request, df_columns = args
        try:
            origin = row.get('origin', 'unknown')
            sample_id = int(row.get('sample_id', 0))

            if origin == 'train':
                dataset = self.experiment.train_loader.dataset
            elif origin == 'eval':
                dataset = self.experiment.eval_loader.dataset
            else:
                _LOGGER.warning("Unknown origin '%s' for sample %s", origin, sample_id)
                return None

            data_stats = []
            raw_data_bytes, transformed_data_bytes = b"", b""
            raw_shape, transformed_shape = [], []

            if hasattr(dataset, "_getitem_raw"):
                tensor, _, label = dataset._getitem_raw(sample_id)
            else:
                tensor, _, label = dataset[sample_id]

            if request.include_transformed_data:
                img = torch.tensor(tensor) if not isinstance(tensor, torch.Tensor) else tensor
                transformed_shape = list(img.shape)
                pil_img = transforms.ToPILImage()(img.detach().cpu())
                buf = io.BytesIO()
                pil_img.save(buf, format='PNG')
                transformed_data_bytes = buf.getvalue()

            if request.include_raw_data:
                try:
                    from trainer_worker import load_raw_image
                    raw_img = load_raw_image(dataset, sample_id)
                    raw_shape = [raw_img.height, raw_img.width, len(raw_img.getbands())]
                    raw_buf = io.BytesIO()
                    raw_img.save(raw_buf, format='PNG')
                    raw_data_bytes = raw_buf.getvalue()
                except Exception as e:
                    _LOGGER.warning(f"Could not load raw image for sample {sample_id}: {e}")
                    raw_data_bytes = transformed_data_bytes
                    raw_shape = transformed_shape

            stats_to_retrieve = request.stats_to_retrieve
            if not stats_to_retrieve:
                stats_to_retrieve = [col for col in df_columns if col not in ['sample_id', 'origin']]

            for stat_name in stats_to_retrieve:
                stat = self._get_stat_from_row(row, stat_name)
                if stat:
                    data_stats.append(stat)
            data_stats.append(pb2.DataStat(
                name='origin', type='string', shape=[1], value_string=origin))
            label_val = int(np.array(label.cpu() if hasattr(label, 'cpu') else label).item())
            data_stats.append(pb2.DataStat(
                name='label', type='scalar', shape=[1], value=[float(label_val)]))

            if raw_data_bytes:
                data_stats.append(pb2.DataStat(
                    name='raw_data', type='bytes', shape=raw_shape,
                    value=raw_data_bytes))
            if transformed_data_bytes:
                data_stats.append(pb2.DataStat(
                    name='transformed_data', type='bytes',
                    shape=transformed_shape, value=transformed_data_bytes))

            return pb2.DataRecord(sample_id=sample_id, data_stats=data_stats)
        except Exception as e:
            _LOGGER.error(f"Error processing row for sample_id {row.get('sample_id', -1)}: {e}", exc_info=True)
            return None

    def GetSamples(self, request, context):
        """
        Retrieve samples from the dataframe with their data statistics.
        Uses the actual proto messages from data_service.proto
        """
        try:
            _LOGGER.info(
                "GetSamples called with start_index=%s, records_cnt=%s",
                request.start_index, request.records_cnt
            )

            # Validate request parameters
            if request.start_index < 0 or request.records_cnt <= 0:
                return pb2.SamplesResponse(
                    success=False,
                    message="Invalid start_index or records_cnt",
                    data_records=[]
                )

            # Get the requested slice of the dataframe
            end_index = request.start_index + request.records_cnt
            df_slice = self._all_datasets_df.iloc[request.start_index:end_index]

            if df_slice.empty:
                _LOGGER.warning("No samples found at index %s", request.start_index)
                return pb2.SamplesResponse(
                    success=False,
                    message=f"No samples found at index {request.start_index}",
                    data_records=[]
                )

            _LOGGER.info("Retrieving samples from %s to %s", request.start_index, end_index)
            _LOGGER.debug("DataFrame slice shape: %s", df_slice.shape)
            _LOGGER.debug("DataFrame slice:\n%s", df_slice.head())

            # Build the data records list in parallel
            data_records = []
            tasks = [(row, request, df_slice.columns) for _, row in df_slice.iterrows()]

            with futures.ThreadPoolExecutor() as executor:
                results = executor.map(self._process_sample_row, tasks)
                data_records = [res for res in results if res is not None]

            _LOGGER.info("Retrieved %s data records", len(data_records))
            return pb2.SamplesResponse(
                success=True,
                message=f"Retrieved {len(data_records)} data records",
                data_records=data_records
            )

        except Exception as e:
            _LOGGER.error("Failed to retrieve samples: %s", str(e), exc_info=True)
            return pb2.SamplesResponse(
                success=False,
                message=f"Failed to retrieve samples: {str(e)}\n{traceback.format_exc()}",
                data_records=[]
            )

    def EditSample(self, request, context):
        _LOGGER.info("EditSample called with request: %s", request)

        if request.stat_name != "tags" and request.stat_name != "deny_listed":
            return pb2.EditsResponse(success=False, message="Only 'tags' stat editing is supported.")

        if request.type == pb2.SampleEditType.ACCUMULATE:
            _LOGGER.info("Accumulate Tagging not supported")
            return pb2.EditsResponse(success=False, message="Tagged samples.")

        for sid, origin in zip(request.samples_ids, request.sample_origins):
            # print(f"Tagging sample_id={sid} from origin={origin} with tag={request.string_value}")
            dataset = self.experiment.train_loader.dataset
            if origin == 'eval':
                dataset = self.experiment.eval_loader.dataset

            if request.stat_name == "tags":
                dataset.set(sid, "tags", request.string_value)
            elif request.stat_name == "deny_listed":
                dataset.set(sid, "deny_listed", request.bool_value)
            # print(dataset.get(sid, "tags"))

        for sid, origin in zip(request.samples_ids, request.sample_origins):
            self._all_datasets_df.loc[
                (self._all_datasets_df['sample_id'] == sid) &
                (self._all_datasets_df['origin'] == origin),
                request.stat_name
            ] = request.string_value if request.stat_name == "tags" else request.bool_value

        print("Dataframe after tagging:\n", self._all_datasets_df.head(16))

        return pb2.EditsResponse(success=True, message="Tagged the samples")


def import_callable(spec: str):
    if ":" not in spec:
        raise SystemExit(
            "Invalid --experiment. Expected 'package.module:function'")
    module, func = spec.split(":", 1)
    mod = importlib.import_module(module)
    fn = getattr(mod, func, None)
    if not callable(fn):
        raise SystemExit(f"'{module}:{func}' not found or not callable")
    return fn


def define_arg_parser():
    if str(Path.cwd()) not in sys.path:
        sys.path.insert(0, str(Path.cwd()))

    parser = argparse.ArgumentParser(description="Trainer worker")
    parser.add_argument(
        "--experiment",
        required=True,
        help="Experiment factory in 'package.module:function' form, "
        "e.g. fashion_mnist_exp_under_2k:get_exp",
    )
    return parser


def serve():
    parser = define_arg_parser()
    args, _ = parser.parse_known_args()

    get_exp = import_callable(args.experiment)
    experiment = get_exp()

    import threading
    training_thread = threading.Thread(
        target=experiment.train_n_steps_with_eval_full,
        args=(10000,)
    )
    training_thread.start()

    print(
        f"[data_service] Loaded experiment from "
        f"{args.experiment}: {experiment}")

    servicer = DataServiceServicer(experiment=experiment)
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    pb2_grpc.add_DataServiceServicer_to_server(servicer, server)

    server.add_insecure_port(f'[::]:{_DEFAULT_DATA_SERVICE_PORT}')
    server.start()
    server.wait_for_termination()

    training_thread.join()


if __name__ == "__main__":
    _LOGGER.info(
        "Starting DataService server on port %s", _DEFAULT_DATA_SERVICE_PORT)
    try:
        serve()
    except Exception as e:
        _LOGGER.error("Server failed to start: %s", str(e), exc_info=True)
        raise
