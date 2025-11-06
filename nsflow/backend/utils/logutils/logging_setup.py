"""
Simplified log bridge for subprocesses:
- Colorful console via logging + rich
- Pretty JSON (single or multi-line)
- Severity from 'message_type' or text tokens
- Special handling for NeuroSan 'Request reporting: { ... }' block
- Tee to terminal + per-process log file
- Run.py stays minimal (no custom streaming there)
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, TextIO

from logging.handlers import TimedRotatingFileHandler
from rich.logging import RichHandler
from rich.console import Console
from rich.theme import Theme
from rich.text import Text


# ---------------- Colors / styles via RichHandler (we color header; JSON stays pretty) ----------------
def _rich_time_text(record=None, date=None):
    now = datetime.now().astimezone()
    return Text(f"[{now.strftime('%Y-%m-%d %H:%M:%S')} {now.tzname()}]", style="logging.time")


class TZFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created).astimezone()
        return f"{dt.strftime('%Y-%m-%d %H:%M:%S')} {dt.tzname()}"


def setup_rich_logging(level: str = "INFO", runner_log_file: Optional[str] = None) -> None:
    """
    Configure the root logger to show colorful console output and (optionally) write the runner's own log file.
    Does not affect child-process tee files; those are managed by ProcessLogTee.
    """
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)           # capture everything; handlers decide levels
    root.handlers.clear()

    # Customize colors here
    # use any formatting supported by Rich's Theme
    # example: "green", "bright_green", "green3", "#34d399", "rgb(52,211,153)", "color(118)", etc.
    theme = Theme({"logging.time": "bright_cyan"})
    console = Console(theme=theme)

    # pretty console levels/time
    handler = RichHandler(
        console=console,
        rich_tracebacks=False,
        markup=False,
        show_time=True,
        show_path=False,
        omit_repeated_times=False,
        # Use ISO-like + TZ, e.g. [2025-11-06 08:54:23 PST]
        log_time_format=_rich_time_text,
    )
    handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)

    if runner_log_file:
        Path(runner_log_file).parent.mkdir(parents=True, exist_ok=True)
        file_handler = TimedRotatingFileHandler(runner_log_file, when="midnight", backupCount=7, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(
            TZFormatter(
                fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
                # datefmt="%Y-%m-%d %H:%M:%S %Z",
            )
        )
        root.addHandler(file_handler)

    logging.getLogger(__name__).info("Runner logging initialized (rich console enabled)")

# ---------------- Severity heuristics ----------------

MESSAGE_TYPE_TO_LEVEL: Dict[str, int] = {
    "trace": logging.DEBUG,
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "other": logging.INFO,
    "success": logging.INFO,
    "warning": logging.WARNING,
    "warn": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
    "fatal": logging.CRITICAL,
}

LEVEL_WORD = re.compile(r"\b(DEBUG|INFO|WARNING|ERROR|CRITICAL|FATAL)\b", re.IGNORECASE)


def infer_level_from_message_type(record: Dict[str, Any]) -> int:
    mt = str(record.get("message_type", "")).strip().lower()
    return MESSAGE_TYPE_TO_LEVEL.get(mt, logging.INFO)


def infer_level_from_text(line: str, default: int = logging.INFO) -> int:
    if not line:
        return default
    m = LEVEL_WORD.search(line)
    if not m:
        if "traceback" in line.lower():
            return logging.ERROR
        return default
    word = m.group(1).upper()
    return logging.CRITICAL if word == "FATAL" else getattr(logging, word, default)


# ---------------- JSON helpers ----------------

def pretty_json(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2, ensure_ascii=False)
    except Exception:
        return str(obj)


def lenient_inner_json_parse(val: Any) -> Optional[Any]:
    """
    Try to parse a JSON-ish string inside 'message', tolerating JSON5-like trailing commas
    and common escaping. Returns a Python object (dict/list) or None.
    Never raises.
    """
    if not isinstance(val, str):
        return None

    s = val.strip()
    if not s:
        return None

    # Fast path: if it already looks like JSON
    if not (s.lstrip().startswith("{") or s.lstrip().startswith("[")):
        return None

    # Try strict first
    try:
        return json.loads(s)
    except Exception:
        pass

    # ---- Lenient cleanup pass ----
    # 1) Unescape typical JSON-escaped control chars (if present as literals)
    #    We do a light touch – not full decoding (outer record already decoded).
    s2 = (s
          .replace("\\r", "\r")
          .replace("\\t", "\t")
          .replace("\\n", "\n"))

    # 2) Remove trailing commas before closing } or ] (JSON5 style)
    #    e.g. {"a":1,} -> {"a":1}  ,  [1,2,] -> [1,2]
    s2 = re.sub(r",\s*(?=[}\]])", "", s2)

    # 3) Compact consecutive newlines (cosmetic; avoids parse issues from weird breaks)
    s2 = re.sub(r"\n{3,}", "\n\n", s2)

    try:
        return json.loads(s2)
    except Exception:
        return None


def count_braces_outside_quotes(s: str) -> int:
    depth = 0
    in_str = False
    esc = False
    for ch in s:
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
    return depth


# ---------------- NeuroSan "Request reporting" reassembly ----------------

_REQUEST_REPORTING_INNER = re.compile(
    r'Request reporting:\s*\{(?P<inner>.*?)\}\s*",', re.IGNORECASE | re.DOTALL
)
_META_FIELDS = ["user_id", "Timestamp", "source", "message_type", "request_id"]
_META_REGEXES = {f: re.compile(rf'"{f}"\s*:\s*"(?P<val>[^"]*)"', re.IGNORECASE) for f in _META_FIELDS}


def rebuild_neurosan_request_reporting(text_block: str) -> Optional[Dict[str, Any]]:
    m = _REQUEST_REPORTING_INNER.search(text_block)
    if not m:
        return None
    inner_src = "{" + m.group("inner").strip() + "}"
    try:
        inner = json.loads(inner_src)
    except Exception:
        inner = inner_src
    out: Dict[str, Any] = {"message": inner}
    for f, rx in _META_REGEXES.items():
        mm = rx.search(text_block)
        if mm:
            out[f] = mm.group("val")
    out.setdefault("Timestamp", datetime.utcnow().isoformat())
    out.setdefault("source", "HttpServer")
    out.setdefault("message_type", "Other")
    return out


# ---------------- Per-process line reassembler (generic) ----------------

class JsonReassembler:
    """
    Accumulates lines until a JSON object is complete (brace-balanced),
    then returns the full text block to parse.
    """
    def __init__(self) -> None:
        self.buffer: List[str] = []
        self.balance: int = 0
        self.collecting: bool = False

    def start_if_jsonish(self, line: str) -> bool:
        if "{" in line:
            self.buffer = [line]
            self.balance = count_braces_outside_quotes(line)
            self.collecting = True
            return True
        return False

    def add_line(self, line: str) -> None:
        self.buffer.append(line)
        self.balance += count_braces_outside_quotes(line)

    def should_flush(self, line: str) -> bool:
        if self.balance <= 0:
            return True
        # tolerant end for broken NeuroSan prints
        if '"request_id"' in line and line.rstrip().endswith("}"):
            return True
        return False

    def flush(self) -> str:
        text = "\n".join(self.buffer).strip()
        self.buffer.clear()
        self.balance = 0
        self.collecting = False
        return text

    def is_collecting(self) -> bool:
        return self.collecting


# ---------------- Process tee (console + file) ----------------

class ProcessLogTee:
    """
    Reads a process pipe line-by-line (in a background thread),
    pretty-prints JSON to terminal (via logging) and mirrors raw lines to a file.
    Keeps 'server-agnostic' behavior; NeuroSan special-case is localized.
    """

    def __init__(self, process_name: str, tee_file: str) -> None:
        self.process_name = process_name
        self.tee_file_path = tee_file
        Path(tee_file).parent.mkdir(parents=True, exist_ok=True)
        self._tee: TextIO = open(tee_file, "a", encoding="utf-8")
        self._logger = logging.getLogger(process_name)
        self._reasm = JsonReassembler()

    def close(self) -> None:
        try:
            self._tee.flush()
            self._tee.close()
        except Exception:
            pass

    def _write_tee(self, raw: str) -> None:
        try:
            self._tee.write(f"{raw}\n")
        except Exception:
            pass

    # def _header(self, level: int, source: Optional[str]) -> str:
    #     lvl = logging.getLevelName(level)
    #     src = f"{self.process_name}:{source}" if source else self.process_name
    #     ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    #     return f"{ts} | {lvl:<8} | {src} - "
    
    def _header(self, level: int, source: Optional[str]) -> str:
        # Only include the source here; Rich prints [time] LEVEL for us
        src = f"{self.process_name}:{source}" if source else self.process_name
        return f"{src} - "

    def _log(self, level: int, msg: str) -> None:
        # One call; RichHandler formats color nicely
        if level >= logging.CRITICAL:
            self._logger.critical(msg)
        elif level >= logging.ERROR:
            self._logger.error(msg)
        elif level >= logging.WARNING:
            self._logger.warning(msg)
        elif level >= logging.INFO:
            self._logger.info(msg)
        else:
            self._logger.debug(msg)

    def _emit_json_block(self, record: Dict[str, Any]) -> None:
        level = infer_level_from_message_type(record)
        src = str(record.get("source") or "").strip() or None
        # Build a display copy so we never mutate the original (raw tee stays exact)
        display_rec = dict(record)

        # If "message" is itself a JSON string, show it as a pretty nested object
        inner = lenient_inner_json_parse(display_rec.get("message"))
        if inner is not None:
            display_rec["message"] = inner

        body = pretty_json(display_rec)
        self._log(level, self._header(level, src) + "\n" + body)

    def _emit_text_line(self, line: str) -> None:
        level = infer_level_from_text(line, logging.INFO)
        self._log(level, self._header(level, None) + line)

    def handle_line(self, raw_line: str) -> None:
        line = raw_line.rstrip("\n")
        if not line:
            self._write_tee(raw_line)
            return

        # Mirror raw first (exactness on disk)
        self._write_tee(line)

        # Try single-line JSON
        obj = lenient_inner_json_parse(line)
        if obj is not None:
            self._emit_json_block(obj)
            return

        # Multi-line collection path
        if not self._reasm.is_collecting():
            if self._reasm.start_if_jsonish(line):
                # If it already closes on same line:
                if self._reasm.balance <= 0:
                    block = self._reasm.flush()
                    self._emit_collected(block)
                return
            # Plain text fallback
            self._emit_text_line(line)
            return

        # We are collecting
        self._reasm.add_line(line)
        if self._reasm.should_flush(line):
            block = self._reasm.flush()
            self._emit_collected(block)

    def _emit_collected(self, block: str) -> None:
        obj = lenient_inner_json_parse(block)
        if obj is not None:
            self._emit_json_block(obj)
            return

        rebuilt = rebuild_neurosan_request_reporting(block)
        if rebuilt is not None:
            self._emit_json_block(rebuilt)
            return

        # Still not JSON → collapse to one line
        flat = " ".join(p.strip() for p in block.splitlines() if p.strip())
        self._emit_text_line(flat)


# ---------------- Public API used by run.py ----------------

def attach_process_logger(process, process_name: str, log_file: str) -> None:
    """
    Create two background threads to drain stdout/stderr of the process,
    pretty-print to terminal, and tee *raw* lines to log_file.
    """
    tee_out = ProcessLogTee(process_name, log_file)
    tee_err = ProcessLogTee(process_name, log_file)

    t_out = threading.Thread(target=drain_pipe, args=(process.stdout, tee_out), daemon=True)
    t_err = threading.Thread(target=drain_pipe, args=(process.stderr, tee_err), daemon=True)
    t_out.start()
    t_err.start()


def drain_pipe(pipe, tee: ProcessLogTee) -> None:
    try:
        for line in iter(pipe.readline, ""):
            tee.handle_line(line)
    finally:
        try:
            pipe.close()
        except Exception:
            pass
        tee.close()
