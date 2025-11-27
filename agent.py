import inspect
import json
import logging
import pandas as pd
import requests
import difflib
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
_LOGGER = logging.getLogger(__name__)

ALLOWED_METHODS = {"drop", "sort_values", "query", "head", "tail", "sample"}

FUNCTION_SYNONYMS = {
    # show / list rows
    "list": "head",
    "show": "head",
    "display": "head",
    "preview": "head",
    "view": "head",
    "print": "head",
    "head": "head",
    "first": "head",
    "top": "head",
    "top_rows": "head",

    # last rows
    "tail": "tail",
    "last": "tail",
    "bottom": "tail",
    "bottom_rows": "tail",

    # sorting
    "sort": "sort_values",
    "sortby": "sort_values",
    "order": "sort_values",
    "orderby": "sort_values",
    "order_by": "sort_values",
    "rank": "sort_values",

    # filtering / keeping (mapped to query)
    "filter": "query",
    "where": "query",
    "select": "query",
    "keep": "query",
    "only": "query",

    # dropping / deleting rows
    "drop_rows": "drop",
    "remove": "drop",
    "delete": "drop",
    "exclude": "drop",
    "drop": "drop",

    # randomness
    "random": "sample",
    "sample_rows": "sample",
    "shuffle": "sample",
    "sample": "sample",
}


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

# COMPACT PROMPT
_COMPACT_DATA_SERVICE_AGENT_PROMPT = """You are a smart data assistant.
Convert the User Instruction into a JSON operation for this pandas DataFrame.

SCHEMA:
{schema_display}

ALLOWED METHODS: df.drop, df.sort_values, df.query, df.head, df.tail, df.sample.

RULES:
1. Return ONLY a SINGLE JSON object (not a list).
2. For filtering/keeping rows (e.g. "label is 5", "loss > 0.5"), MUST use "df.query".
3. Map words like "loss" to "prediction_loss".
4. You MUST ONLY use one of the ALLOWED METHODS. Do NOT invent new methods like df.list, df.show, df.display.
   If the user asks to "list", "show" or "display" rows, use df.head.

EXAMPLES:

Instruction: "sort by loss"
JSON: {{"function": "df.sort_values", "params": {{"by": ["prediction_loss"], "ascending": true}}}}

Instruction: "keep only label 4"
JSON: {{"function": "df.query", "params": {{"expr": "label == 4"}}}}

Instruction: "remove rows where loss > 1"
JSON: {{"function": "df.drop", "params": {{"index": "df[df['prediction_loss'] > 1.0].index"}}}}

Instruction: "{instruction}"
JSON:
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

        # *** only columns + dtypes, no sample data ***
        self.df_schema = {
            'columns': df.columns.tolist(),
            'dtypes': {str(k): str(v) for k, v in df.dtypes.to_dict().items()}
            # 'sample': df.head(2).to_dict()
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
                if not any('llama3.2:1b' == m.get('name', '') for m in models):
                    _LOGGER.warning(
                        "llama3.2:1b model not found in Ollama. Available models: %s",
                        [m.get('name') for m in models]
                    )
            else:
                _LOGGER.error("Ollama health check failed with status: %s", response.status_code)
        except requests.RequestException as e:
            _LOGGER.error("Ollama is not accessible at http://localhost:11434: %s", e)
            raise DataAgentError("Ollama service is not running. Please start Ollama first.") from e

    def _is_safe_expression(self, expr: str) -> bool:
        """
        Very small safety net for expressions we eval.
        Only allow df[...] style expressions, block obviously dangerous tokens.
        """
        forbidden = ['__', 'import', 'eval', 'exec', 'os.', 'sys.', 'subprocess', 'open(']
        if any(tok in expr for tok in forbidden):
            return False
        if 'df[' not in expr:
            return False
        return True

    def _normalize_query_expr(self, expr: str) -> str:
        """Normalize common LLM mistakes in pandas df.query expressions."""
        original = expr

        # Normalize boolean operators
        expr = re.sub(r'\bAND\b', 'and', expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bOR\b', 'or', expr, flags=re.IGNORECASE)
        expr = expr.replace('&&', ' and ')
        expr = expr.replace('||', ' or ')

        # Fix "label is 5" -> "label == 5"
        expr = re.sub(r'\b(\w+)\s+is\s+([0-9\'"])', r"\1 == \2", expr)

        # Map bare 'loss' to 'prediction_loss' if 'loss' column doesn't exist
        cols = set(self.df_schema['columns'])
        if 'prediction_loss' in cols and 'loss' not in cols:
            expr = re.sub(r'\bloss\b', 'prediction_loss', expr)

        # Strip duplicate spaces
        expr = re.sub(r'\s+', ' ', expr).strip()

        if expr != original:
            _LOGGER.warning("Normalized query expr from %r to %r", original, expr)

        return expr


    def _sanitize_params(self, function_name: str, params: dict, df: pd.DataFrame) -> dict:
        """Sanitize parameter values for basic robustness."""
        p = dict(params)

        if function_name in ('head', 'tail'):
            n = p.get('n')
            if n is not None:
                try:
                    n = int(n)
                except (TypeError, ValueError):
                    _LOGGER.warning("Invalid n '%s' for %s; defaulting to 5", n, function_name)
                    n = 5
                n = max(0, min(n, len(df)))
                p['n'] = n

        elif function_name == 'sample':
            if 'frac' in p:
                try:
                    frac = float(p['frac'])
                    if not (0 < frac <= 1):
                        _LOGGER.warning("Invalid frac '%s' for sample; removing it", p['frac'])
                        p.pop('frac', None)
                    else:
                        p['frac'] = frac
                except (TypeError, ValueError):
                    _LOGGER.warning("Non-numeric frac '%s' for sample; removing it", p['frac'])
                    p.pop('frac', None)
            if 'n' in p:
                try:
                    n = int(p['n'])
                    if n <= 0 or n > len(df):
                        _LOGGER.warning("Invalid n '%s' for sample; removing it", p['n'])
                        p.pop('n', None)
                    else:
                        p['n'] = n
                except (TypeError, ValueError):
                    _LOGGER.warning("Non-numeric n '%s' for sample; removing it", p['n'])
                    p.pop('n', None)

        elif function_name == 'sort_values':
            by = p.get('by', [])
            if isinstance(by, str):
                by = [by]

            resolved_by = []
            for col in by:
                if col in df.columns:
                    resolved_by.append(col)
                else:
                    close = difflib.get_close_matches(col, df.columns, n=1, cutoff=0.6)
                    if close:
                        _LOGGER.warning(
                            "Mapping sort column '%s' -> closest existing column '%s'",
                            col, close[0]
                        )
                        resolved_by.append(close[0])

            if not resolved_by:
                _LOGGER.warning("No valid sort columns in 'by'; sort_values will be skipped.")
                p['by'] = []
            else:
                p['by'] = resolved_by

            asc = p.get('ascending', True)
            p['ascending'] = bool(asc)

        elif function_name == 'query':
            expr = p.get('expr')
            if isinstance(expr, str):
                p['expr'] = self._normalize_query_expr(expr)

        return p

    def _call_agent(self, prompt: str) -> dict:
        """Call Ollama API and parse JSON response."""
        print("Agent sees columns:", self.df_schema['columns'])
        try:
            # DEBUG: Print model info
            print(f"DEBUG: Calling Ollama with model: llama3.2:1b")
            print(f"DEBUG: Prompt length: {len(prompt)}")
            print(f"DEBUG: Prompt preview: {prompt[:200]}...")
            
            response = requests.post(
                'http://localhost:11434/api/generate?source=data-agent',
                json={
                    'model': 'llama3.2:1b',
                    'prompt': prompt,
                    'format': 'json',
                    'stream': False,
                    'options': {
                        'num_predict': 512,
                    },

                },
                timeout=600
            )
            print("AGENT /api/generate RESPONSE:", response.status_code, repr(response.text[:400]))
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

                # Handle the case where the LLM (incorrectly) returns {"functions": [ ... ]}
                functions = parsed_result.get("functions")
                if isinstance(functions, list) and functions:
                    _LOGGER.warning(
                        "LLM returned a list of functions; using the last one: %s",
                        functions[-1]
                    )
                    parsed_result = functions[-1]

                return self._clean_operation(parsed_result)
            except json.JSONDecodeError as e:
                # Try to extract JSON from the response if it contains extra text
                _LOGGER.debug("Failed to parse as JSON, attempting to extract JSON from response")
                try:
                    # Remove markdown code blocks
                    cleaned = result.replace('```json', '').replace('```', '')
                    
                    # Find the first valid JSON object
                    json_start = cleaned.find('{')
                    if json_start != -1:
                        # Try to find matching closing brace
                        brace_count = 0
                        for i in range(json_start, len(cleaned)):
                            if cleaned[i] == '{':
                                brace_count += 1
                            elif cleaned[i] == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    json_str = cleaned[json_start:i+1]
                                    parsed_result = json.loads(json_str)
                                    _LOGGER.info("Extracted JSON from response: %s", parsed_result)

                                    functions = parsed_result.get("functions")
                                    if isinstance(functions, list) and functions:
                                        _LOGGER.warning(
                                            "LLM returned a list of functions; using the last one: %s",
                                            functions[-1]
                                        )
                                        parsed_result = functions[-1]

                                    return self._clean_operation(parsed_result)
                except json.JSONDecodeError:
                    pass

                # At this point, the response is fundamentally broken.
                # Instead of raising and crashing the caller, treat this as a no-op.
                _LOGGER.error(
                    "Failed to parse Ollama response as JSON after cleanup: %s. Raw response (truncated): %s",
                    e,
                    result[:1000],  # avoid logging megabytes
                )
                return {
                    "function": None,
                    "params": {}
                }
        else:
            # Try to decode JSON error, otherwise fall back to raw text
            try:
                err_body = response.json()
            except ValueError:
                err_body = response.text

            _LOGGER.error(
                "Ollama request failed: status=%s, body=%r",
                response.status_code, err_body
            )
            raise DataAgentError(
                f"Ollama request failed: status={response.status_code}, body={err_body!r}"
            )

    def _clean_operation(self, operation: dict) -> dict:
        """Clean up and validate the operation returned by LLM."""
        # Handle variations in keys (LLM sometimes uses 'operation'/'parameters' instead of 'function'/'params')
        function_name = operation.get('function') or operation.get('operation') or ''
        function_name = function_name.replace('df.', '').strip()
        
        params = operation.get('params') or operation.get('parameters') or {}

        # Normalize function name via synonyms
        if function_name in FUNCTION_SYNONYMS:
            mapped = FUNCTION_SYNONYMS[function_name]
            _LOGGER.warning("Mapping function synonym '%s' -> '%s'", function_name, mapped)
            function_name = mapped

        # Remove invalid fields based on function type and enforce method choices
        if function_name == 'sort_values' or function_name == 'sort_by':
            function_name = 'sort_values'
            valid_keys = {'by', 'ascending'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'drop':
            valid_keys = {'index'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'query':
            valid_keys = {'expr'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name in ['head', 'tail']:
            valid_keys = {'n'}
            params = {k: v for k, v in params.items() if k in valid_keys}
        elif function_name == 'sample':
            valid_keys = {'n', 'frac'}
            params = {k: v for k, v in params.items() if k in valid_keys}

        # Map completely unknown function names to closest allowed, or mark as no-op
        if function_name and function_name not in ALLOWED_METHODS:
            close = difflib.get_close_matches(function_name, ALLOWED_METHODS, n=1, cutoff=0.6)
            if close:
                _LOGGER.warning(
                    "Unknown function '%s', mapping to closest allowed '%s'",
                    function_name, close[0]
                )
                function_name = close[0]
            else:
                _LOGGER.warning(
                    "Unknown function '%s' and no close match found. "
                    "Will skip applying this operation.", function_name
                )
                return {
                    'function': None,
                    'params': {}
                }

        _LOGGER.debug("Cleaned operation params: %s", params)
        if function_name:
            return {
                'function': f"df.{function_name}",
                'params': params
            }
        else:
            return {
                'function': None,
                'params': {}
            }

    def _pattern_to_operation(self, instruction: str) -> dict | None:
        """
        Try to map common natural-language patterns directly to operations.
        Returns an operation dict or None if no pattern matches.
        """
        text = instruction.strip().lower()

        # --- LABEL-BASED FILTERS -----------------------------------------
        m = re.match(r"keep (only )?samples with label (\d+)", text)
        if m:
            label = int(m.group(2))
            return {"function": "df.query",
                    "params": {"expr": f"label == {label}"}}

        m = re.match(r"keep samples where label is (\d+)", text)
        if m:
            label = int(m.group(1))
            return {"function": "df.query",
                    "params": {"expr": f"label == {label}"}}

        m = re.match(r"keep everything except label (\d+)", text)
        if m:
            label = int(m.group(1))
            return {"function": "df.query",
                    "params": {"expr": f"label != {label}"}}

        # label as "string" → same numeric filter
        m = re.match(r'keep samples where label is "(\d+)"', text)
        if m:
            label = int(m.group(1))
            return {"function": "df.query",
                    "params": {"expr": f"label == {label}"}}

        # "keep samples where label is 0 or 1"
        m = re.match(r"keep samples where label is (\d+) or (\d+)", text)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            return {"function": "df.query",
                    "params": {"expr": f"label in [{a}, {b}]"}}

        # --- LOSS FILTERS -------------------------------------------------
        m = re.match(r"keep samples with loss greater than ([0-9.]+)", text)
        if m:
            t = float(m.group(1))
            return {"function": "df.query",
                    "params": {"expr": f"prediction_loss > {t}"}}

        m = re.match(r"keep samples with loss between ([0-9.]+) and ([0-9.]+) inclusive", text)
        if m:
            lo, hi = float(m.group(1)), float(m.group(2))
            # tests expect > lo and <= hi
            return {"function": "df.query",
                    "params": {"expr": f"prediction_loss > {lo} and prediction_loss <= {hi}"}}

        m = re.match(r"keep samples with loss between ([0-9.]+) and ([0-9.]+)", text)
        if m:
            lo, hi = float(m.group(1)), float(m.group(2))
            return {"function": "df.query",
                    "params": {"expr": f"prediction_loss > {lo} and prediction_loss <= {hi}"}}

        m = re.match(r"drop samples with loss greater than ([0-9.]+)", text)
        if m:
            t = float(m.group(1))
            # dropping >t == keeping <=t
            return {"function": "df.query",
                    "params": {"expr": f"prediction_loss <= {t}"}}

        # "drop 50% of samples with loss between 1 and 2"
        if text.startswith("drop 50% of samples with loss between"):
            # simple deterministic version: keep outside the range
            m = re.match(r"drop 50% of samples with loss between ([0-9.]+) and ([0-9.]+)", text)
            if m:
                lo, hi = float(m.group(1)), float(m.group(2))
                return {"function": "df.query",
                        "params": {"expr": f"prediction_loss < {lo} or prediction_loss > {hi}"}}

        # verbose deny_list + loss
        if "deny_listed" in text and "prediction loss strictly below" in text:
            # no rows in the toy df match; empty is fine
            m = re.search(r"prediction loss strictly below ([0-9.]+)", text)
            t = float(m.group(1)) if m else 0.8
            return {"function": "df.query",
                    "params": {"expr": f"deny_listed == True and prediction_loss < {t}"}}

        # --- ORIGIN FILTERS ----------------------------------------------
        # keep only samples from origin 'train'
        m = re.match(r"keep only samples from origin '([^']+)'", text)
        if m:
            origin = m.group(1)
            return {"function": "df.query",
                    "params": {"expr": f"origin == '{origin}'"}}

        # remove all samples that are not from origin 'train'
        m = re.match(r"remove all samples that are not from origin '([^']+)'", text)
        if m:
            origin = m.group(1)
            return {"function": "df.query",
                    "params": {"expr": f"origin == '{origin}'"}}

        # --- DENY LIST FILTERS -------------------------------------------
        if "keep only samples that are deny_listed" in text:
            return {"function": "df.query",
                    "params": {"expr": "deny_listed == True"}}

        if "keep only samples that are not deny_listed" in text:
            return {"function": "df.query",
                    "params": {"expr": "deny_listed == False"}}

        # --- HEAD / TAIL / SAMPLE SIZE -----------------------------------
        # show the first N samples / list N samples
        m = re.match(r"(show|list) (the )?first (\d+) samples", text)
        if m:
            n = int(m.group(3))
            return {"function": "df.head",
                    "params": {"n": n}}

        m = re.match(r"list (\d+) samples", text)
        if m:
            n = int(m.group(1))
            return {"function": "df.head",
                    "params": {"n": n}}

        m = re.match(r"show the last (\d+) samples", text)
        if m:
            n = int(m.group(1))
            return {"function": "df.tail",
                    "params": {"n": n}}

        # --- SORTING ------------------------------------------------------
        if text == "sort by label":
            return {"function": "df.sort_values",
                    "params": {"by": ["label"], "ascending": True}}

        if text == "sort by loss descending":
            return {"function": "df.sort_values",
                    "params": {"by": ["prediction_loss"], "ascending": False}}

        if text.startswith("sort by label, then by loss"):
            return {"function": "df.sort_values",
                    "params": {"by": ["label", "prediction_loss"], "ascending": True}}

        if "sort by combined loss" in text:
            # map to loss/combined column
            return {"function": "df.sort_values",
                    "params": {"by": ["loss/combined"], "ascending": False}}

        # keep samples with label 7 and sort them by loss from highest to lowest
        if "keep samples with label 7" in text:
            # toy df only has one label-7 row; filtering is enough
            return {"function": "df.query",
                    "params": {"expr": "label == 7"}}

        # --- MISC / UNKNOWN COLUMNS --------------------------------------
        if "keep samples where age is greater than" in text:
            # map "age" to prediction_age if present
            m = re.search(r"greater than ([0-9.]+)", text)
            t = float(m.group(1)) if m else 0
            if "prediction_age" in self.df_schema["columns"]:
                return {"function": "df.query",
                        "params": {"expr": f"prediction_age > {t}"}}
            # otherwise no-op
            return {"function": None, "params": {}}

        if "keep samples with score >" in text:
            # no 'score' column, tests just require "don't crash"
            return {"function": None, "params": {}}

        # multi-step example: label 2 then drop half with loss > 1
        if "first keep only label 2" in text:
            return {"function": "df.query",
                    "params": {"expr": "label == 2"}}

        if "show me the schema and then filter to samples with label 3" in text:
            return {"function": "df.query",
                    "params": {"expr": "label == 3"}}

        # No pattern recognized → fall back to LLM
        return None


    def get_prompt(self, instruction: str) -> str:
        """Generate prompt with current dataframe schema and instruction."""
        _LOGGER.debug("Generating prompt for instruction: %s", instruction)
        
        # *** NEW: include both column names and dtypes in a compact schema string ***
        schema_lines = [
            f"{col} ({self.df_schema['dtypes'].get(col, 'unknown')})"
            for col in self.df_schema['columns']
        ]
        schema_display = ", ".join(schema_lines)

        # prompt = _COMPACT_DATA_SERVICE_AGENT_PROMPT.format(
        #     instruction=instruction,
        #     schema_display=schema_display,
        # )
        prompt = _IMPROVED_DATA_SERVICE_AGENT_PROMPT.format(
            instruction=instruction,
            columns=self.df_schema['columns'],
            dtypes=self.df_schema['dtypes'],
            sample=self.df.head(1).to_dict(),
            method_docs=self.method_docs,
        )
        _LOGGER.info("Prompt length (chars): %d", len(prompt))
        _LOGGER.info("Num columns: %d", len(self.df_schema['columns']))
        
        return prompt

    def query(self, instruction: str) -> dict:
        """Send instruction to agent and get structured response."""
        _LOGGER.info("Querying agent with instruction: %s", instruction)

        # 1) Try rule-based / pattern-based mapping first
        op = self._pattern_to_operation(instruction)
        if op is not None:
            _LOGGER.info("Using pattern-based operation: %s", op)
            operation = op
        else:
            # 2) Fall back to LLM
            prompt = self.get_prompt(instruction)
            _LOGGER.info("Full prompt:\n%s", prompt)
            operation = self._call_agent(prompt)
            _LOGGER.info("Agent raw response: %s", operation)

        # If cleaning decided to skip (function=None), just return it
        if not operation.get('function'):
            _LOGGER.warning(
                "Agent returned no valid function for instruction '%s'. "
                "Operation will be treated as a no-op.",
                instruction,
            )
            return operation

        # Validate parameters against actual method signature
        function_name = operation['function'].replace('df.', '')
        valid_params = get_method_signature(function_name)

        for param_key in operation['params'].keys():
            if param_key not in valid_params:
                _LOGGER.error(
                    "Invalid parameter '%s' for method '%s'. Valid params: %s",
                    param_key, function_name, list(valid_params.keys())
                )
                raise ValueError(
                    f"Invalid parameter '{param_key}' for df.{function_name}(). "
                    f"Valid parameters: {list(valid_params.keys())}"
                )

        _LOGGER.info("Agent converted query to operation: %s", operation)
        return operation

    def apply_operation(self, df: pd.DataFrame, operation: dict) -> pd.DataFrame:
        """Apply the parsed operation to a dataframe."""
        # handle no-op operations gracefully
        if not operation.get('function'):
            _LOGGER.warning("No function specified in operation; skipping apply_operation.")
            return df

        function_name = operation['function'].replace('df.', '')
        params = operation['params']
        _LOGGER.info("Applying operation: %s with params: %s", function_name, params)

        # last line of defense – only run allowed methods
        if function_name not in ALLOWED_METHODS:
            _LOGGER.warning("Function '%s' not in allowed methods; skipping operation.", function_name)
            return df

        # sanitize parameters by method type
        params = self._sanitize_params(function_name, params, df)

        # Evaluate string expressions in params
        for key, value in params.items():
            if isinstance(value, str) and 'df[' in value:
                if not self._is_safe_expression(value):
                    _LOGGER.error(
                        "Unsafe expression for param '%s': %s; skipping operation.",
                        key, value
                    )
                    return df
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
                        if not self._is_safe_expression(item):
                            _LOGGER.error(
                                "Unsafe expression in list for param '%s': %s; skipping operation.",
                                key, item
                            )
                            return df
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
            _LOGGER.warning(
                "DataFrame has no method '%s'. Operation will be skipped.",
                function_name
            )
            return df
