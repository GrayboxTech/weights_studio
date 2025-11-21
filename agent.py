
import inspect
import json
import logging
import pandas as pd
import requests


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
_LOGGER = logging.getLogger(__name__)


def get_method_signature(method_name: str) -> dict:
    """Extract valid parameters for a pandas DataFrame method."""
    try:
        method = getattr(pd.DataFrame, method_name)
        sig = inspect.signature(method)
        params = {}
        for param_name, param in sig.parameters.items():
            if param_name == 'self':
                continue
            params[param_name] = {
                'type': str(param.annotation) if param.annotation != inspect.Parameter.empty else 'any',
                'default': param.default if param.default != inspect.Parameter.empty else 'required'
            }
        return params
    except Exception as e:
        _LOGGER.warning(f"Could not extract signature for {method_name}: {e}")
        return {}


def build_method_docs() -> str:
    """Build documentation of valid methods and their parameters."""
    common_methods = ['drop', 'sort_values', 'query', 'filter', 'head', 'tail', 'sample']
    docs = "Valid DataFrame methods and their parameters:\n\n"

    for method_name in common_methods:
        params = get_method_signature(method_name)
        if params:
            param_list = ", ".join([f"{k} ({v['type']})" for k, v in params.items()])
            docs += f"- df.{method_name}({param_list})\n"

    return docs


_DEFAULT_DATA_SERVICE_AGENT_PROMPT = """
You are a code parser that converts short natural language instructions about 
dataframes into structured Python dataframe operations.

DataFrame Schema:
- Columns: {columns}
- Data Types: {dtypes}
- Sample Data: {sample}

Given a human-language instruction, output ONLY a JSON object with:
- "function": the pandas method or expression to call
- "params": a dictionary of parameters to pass to that function

Do NOT include any explanatory text, preamble, or markdown formatting. Return ONLY valid JSON.

IMPORTANT: When using df.drop(), always use .index to get the indices:
    "index": "df[condition].index"

Examples:

Instruction:
"drop samples with last_loss/classification between 1.2 and 2.6 at a rate of 50%"
Output:
{{
    "function": "df.drop",
    "params": {{
        "index": "df[df['last_loss/classification'].between(1.2, 2.6)].sample(frac=0.5).index"
    }}
}}

Instruction: "order samples by lastloss/classification + lastloss/reconstruction, then by label"
Output:
{{
    "function": "df.sort_values",
    "params": {{
        "by": [
            "(df['lastloss/classification'] + df['lastloss/reconstruction'])",
            "label"
        ],
        "ascending": true
    }}
}}

Please parse this human-language instruction: {instruction}
Output (JSON only, no other text):
"""


_IMPROVED_DATA_SERVICE_AGENT_PROMPT = """You are a JSON code parser. Your ONLY job is to convert natural language instructions into JSON operations.

RESPOND WITH ONLY VALID JSON. NO OTHER TEXT. NO EXPLANATIONS. NO QUESTIONS.

DataFrame Schema:
- Columns: {columns}
- Data Types: {dtypes}
- Sample Data: {sample}

Valid DataFrame Methods:
{method_docs}

CRITICAL SYNTAX RULES:
1. ALL brackets must be balanced: every '[' needs a ']', every '(' needs a ')'
2. For df.drop() with conditions AND sampling, use this EXACT pattern:
   "index": "df[df['column'].between(min, max)].sample(frac=0.5).index"
   Notice: .between() has its closing parenthesis BEFORE .sample()
3. WRONG: "df[df['column'].between(min, max).sample(frac=0.5).index" (missing ] after between())
4. RIGHT: "df[df['column'].between(min, max)].sample(frac=0.5).index"

CRITICAL COMPARISON OPERATORS:
1. For equality checks, use == operator, NOT .equal() or .equals()
   RIGHT: "df[df['column'] == value]"
   WRONG: "df[df['column'].equal(value)]"
2. For inequality: use !=, >, <, >=, <=
3. For range checks: use .between(min, max)
4. Examples:
   - "df[df['target'] == 5]" (equals 5)
   - "df[df['value'] > 10]" (greater than 10)
   - "df[df['score'].between(0.2, 0.8)]" (between range)

CRITICAL COLUMN MAPPING RULES:
1. You MUST ONLY use column names that exist in the DataFrame Schema above
2. If the user mentions a column that doesn't exactly match, find the closest matching column from the list
3. For example:
   - If user says "loss" or "lastloss" and columns include "last_loss", use "last_loss" or whatever is having the word loss in it
   - If user says "prediction" and columns include "prediction_loss", use "prediction_loss"
   - If user says "class " and columns include "last_loss/classification", use "last_loss/classification"
4. ALWAYS prefer columns that contain the user's keywords
5. If multiple columns could match, choose the one with the most similar name

RULES:
1. Return ONLY a JSON object with "function" and "params" keys
2. For df.drop(), use ONLY "index" parameter with df[condition].index
3. For df.sort_values(), use ONLY "by" and "ascending" parameters - NEVER add "index" or other fields
4. NO preamble, NO markdown, NO extra text - ONLY JSON
5. ONLY use columns that exist in the DataFrame schema above
6. Do NOT add extra fields like "index", "level", or "kind" to params
7. ALWAYS map user column references to actual column names from the schema
8. NEVER include unquoted Python expressions in JSON values
9. If user mentions a column that doesn't exist, intelligently pick the closest matching column name
10. ALWAYS use == for equality, NEVER use .equal() or .equals()

EXAMPLES (follow these patterns exactly):

Instruction: "drop samples with value between 1.2 and 2.6 at a rate of 50%"
{{"function": "df.drop", "params": {{"index": "df[df['value'].between(1.2, 2.6)].sample(frac=0.5).index"}}}}

Instruction: "discard 50% of train samples with loss between 0.2 and 1"
{{"function": "df.drop", "params": {{"index": "df[df['loss'].between(0.2, 1.0)].sample(frac=0.5).index"}}}}

Instruction: "drop 50% of samples where target equals 5"
{{"function": "df.drop", "params": {{"index": "df[df['target'] == 5].sample(frac=0.5).index"}}}}

Instruction: "remove samples with score greater than 0.8"
{{"function": "df.drop", "params": {{"index": "df[df['score'] > 0.8].index"}}}}

Instruction: "sort by last_loss ascending"
{{"function": "df.sort_values", "params": {{"by": ["last_loss"], "ascending": true}}}}

Instruction: "order samples by value ascending"
{{"function": "df.sort_values", "params": {{"by": ["value"], "ascending": true}}}}

Instruction: "sort by loss descending"
{{"function": "df.sort_values", "params": {{"by": ["loss"], "ascending": false}}}}

Instruction: "filter to keep only samples from eval"
{{"function": "df.query", "params": {{"expr": "origin == 'eval'"}}}}

Instruction: "get first 100 samples"
{{"function": "df.head", "params": {{"n": 100}}}}

NOW CONVERT THIS INSTRUCTION TO JSON:
Instruction: {instruction}
RESPOND WITH ONLY JSON:
"""


class DataAgentError(Exception):
    """Custom exception for Data Manipulation Agent errors."""
    pass


class DataManipulationAgent:
    def __init__(self, df):
        _LOGGER.info("Initializing DataManipulationAgent")
        self.df = df
        self.method_docs = build_method_docs()
        _LOGGER.info("Agent initialized with method documentation:\n%s", self.method_docs)
        self.df_schema = {
            'columns': df.columns.tolist(),
            'dtypes': {str(k): str(v) for k, v in df.dtypes.to_dict().items()},
            'sample': df.head(2).to_dict()
        }
        _LOGGER.info("Agent initialized with schema: columns=%s", self.df_schema['columns'])
        self._check_ollama_health()

    def _check_ollama_health(self):
        """Check if Ollama is running and accessible."""
        try:
            response = requests.get('http://localhost:11434/api/tags', timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                _LOGGER.info("Ollama is running with models: %s", [m.get('name') for m in models])
                if not any('llama2' in m.get('name', '') for m in models):
                    _LOGGER.warning("llama2 model not found in Ollama. Available models: %s", [m.get('name') for m in models])
            else:
                _LOGGER.error("Ollama health check failed with status: %s", response.status_code)
        except requests.RequestException as e:
            _LOGGER.error("Ollama is not accessible at http://localhost:11434: %s", e)
            raise DataAgentError("Ollama service is not running. Please start Ollama first.") from e

    def _call_agent(self, prompt: str) -> dict:
        """Call Ollama API and parse JSON response."""
        try:
            response = requests.post(
                'http://localhost:11434/api/generate',
                json={
                    'model': 'llama2',
                    'prompt': prompt,
                    'stream': False
                },
                timeout=60
            )
            _LOGGER.debug("Ollama response status: %s", response.status_code)
        except requests.ConnectionError as e:
            _LOGGER.error("Failed to connect to Ollama: %s", e)
            raise DataAgentError("Ollama service is not running or not accessible") from e
        except requests.Timeout as e:
            _LOGGER.error("Ollama request timed out: %s", e)
            raise DataAgentError("Ollama request timed out - service may be overloaded") from e
        except requests.RequestException as e:
            _LOGGER.error("Ollama request failed: %s", e)
            raise DataAgentError(f"Ollama request failed: {e}") from e

        if response.status_code == 200:
            result = response.json().get('response', '').strip()
            _LOGGER.debug("Ollama raw response: %s", result)

            if not result:
                _LOGGER.error("Ollama returned empty response")
                raise DataAgentError("Ollama returned empty response")

            # Convert Python booleans to JSON booleans
            result = result.replace('False', 'false').replace('True', 'true').replace('None', 'null')

            try:
                parsed_result = json.loads(result)
                _LOGGER.info("Ollama returned operation: %s", parsed_result)
                return self._clean_operation(parsed_result)
            except json.JSONDecodeError as e:
                # Try to extract JSON from the response if it contains extra text
                _LOGGER.debug("Failed to parse as JSON, attempting to extract JSON from response")
                try:
                    json_start = result.find('{')
                    json_end = result.rfind('}') + 1
                    if json_start != -1 and json_end > json_start:
                        json_str = result[json_start:json_end]
                        parsed_result = json.loads(json_str)
                        _LOGGER.info("Extracted JSON from response: %s", parsed_result)
                        return self._clean_operation(parsed_result)
                except json.JSONDecodeError:
                    pass
                
                _LOGGER.error("Failed to parse Ollama response as JSON: %s. Raw response: %s", e, result)
                raise DataAgentError(f"Ollama response is not valid JSON: {result}") from e
        else:
            _LOGGER.error("Ollama request failed with status: %s, response: %s", response.status_code, response.text)
            raise DataAgentError(f"Ollama request failed: {response.status_code}")

    def _clean_operation(self, operation: dict) -> dict:
        """Clean up and validate the operation returned by LLM."""
        function_name = operation.get('function', '').replace('df.', '')
        params = operation.get('params', {})

        # Remove invalid fields based on function type
        if function_name == 'sort_values':
            # sort_values should only have 'by' and 'ascending'
            valid_keys = {'by', 'ascending'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'drop':
            # drop should only have 'index'
            valid_keys = {'index'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'query':
            # query should only have 'expr'
            valid_keys = {'expr'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name in ['head', 'tail']:
            # head/tail should only have 'n'
            valid_keys = {'n'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'sample':
            # sample can have 'n' or 'frac'
            valid_keys = {'n', 'frac'}
            params = {k: v for k, v in params.items() if k in valid_keys}

        _LOGGER.debug("Cleaned operation params: %s", params)
        return {
            'function': f"df.{function_name}",
            'params': params
        }

    def get_prompt(self, instruction: str) -> str:
        """Generate prompt with current dataframe schema and instruction."""
        _LOGGER.debug("Generating prompt for instruction: %s", instruction)
        return _IMPROVED_DATA_SERVICE_AGENT_PROMPT.format(
            instruction=instruction,
            columns=self.df_schema['columns'],
            dtypes=self.df_schema['dtypes'],
            sample=self.df_schema['sample'],
            method_docs=self.method_docs
        )

    def query(self, instruction: str) -> dict:
        """Send instruction to agent and get structured response."""
        _LOGGER.info("Querying agent with instruction: %s", instruction)
        prompt = self.get_prompt(instruction)
        _LOGGER.info("Full prompt:\n%s", prompt)

        # Call your Ollama/LLM implementation here
        operation = self._call_agent(prompt)

        _LOGGER.info("Agent raw response: %s", operation)

        # Validate parameters against actual method signature
        function_name = operation['function'].replace('df.', '')
        valid_params = get_method_signature(function_name)

        for param_key in operation['params'].keys():
            if param_key not in valid_params:
                _LOGGER.error("Invalid parameter '%s' for method '%s'. Valid params: %s", 
                            param_key, function_name, list(valid_params.keys()))
                raise ValueError(f"Invalid parameter '{param_key}' for df.{function_name}(). Valid parameters: {list(valid_params.keys())}")

        _LOGGER.info("Agent converted query to operation: %s", operation)
        return operation

    def apply_operation(self, df: pd.DataFrame, operation: dict) -> pd.DataFrame:
        """Apply the parsed operation to a dataframe."""
        function_name = operation['function'].replace('df.', '')
        params = operation['params']
        _LOGGER.info("Applying operation: %s with params: %s", function_name, params)
        
        # Evaluate string expressions in params
        for key, value in params.items():
            if isinstance(value, str) and 'df[' in value:
                _LOGGER.debug("Evaluating expression for param '%s': %s", key, value)
                try:
                    # Validate brackets are balanced before eval
                    if value.count('[') != value.count(']') or value.count('(') != value.count(')'):
                        _LOGGER.error("Unbalanced brackets in expression: %s", value)
                        raise ValueError(f"Malformed expression with unbalanced brackets: {value}")
                    
                    evaluated = eval(value, {'df': df})
                    _LOGGER.debug("Evaluated to type %s", type(evaluated))
                    params[key] = evaluated
                except SyntaxError as e:
                    _LOGGER.error("Syntax error evaluating expression '%s': %s", value, e)
                    raise ValueError(f"Invalid Python expression generated by agent: {value}") from e
            elif isinstance(value, list):
                evaluated_list = []
                for item in value:
                    if isinstance(item, str) and 'df[' in item:
                        _LOGGER.debug("Evaluating list item: %s", item)
                        try:
                            if item.count('[') != item.count(']') or item.count('(') != item.count(')'):
                                raise ValueError(f"Malformed expression: {item}")
                            evaluated_list.append(eval(item, {'df': df}))
                        except SyntaxError as e:
                            _LOGGER.error("Syntax error in list item '%s': %s", item, e)
                            raise ValueError(f"Invalid expression in list: {item}") from e
                    else:
                        evaluated_list.append(item)
                params[key] = evaluated_list

        # Filter params to only include valid ones for this method
        valid_params = get_method_signature(function_name)
        filtered_params = {k: v for k, v in params.items() if k in valid_params}

        _LOGGER.debug("Filtered params for %s: %s", function_name, filtered_params)

        # Apply the operation
        if hasattr(df, function_name):
            method = getattr(df, function_name)
            result = method(**filtered_params)

            # Only reassign if result is a DataFrame
            if isinstance(result, pd.DataFrame):
                _LOGGER.info("Operation applied successfully, result shape: %s", result.shape)
                return result
            else:
                _LOGGER.warning("Operation returned non-DataFrame result: %s", type(result))
                return df
        else:
            _LOGGER.error("DataFrame has no method '%s'", function_name)
            raise AttributeError(f"DataFrame has no method '{function_name}'")
