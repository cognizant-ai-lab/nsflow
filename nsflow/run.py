# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# imitations under the License.
#
# END COPYRIGHT
import argparse
import logging
import os
import signal
import socket
import subprocess
import sys
import time
from typing import Any, Dict

# Note: Do not use dotenv in a production setup
from dotenv import load_dotenv

from nsflow.backend.utils.logutils.process_log_bridge import ProcessLogBridge

log_cfg = {
    # Refer rich guidelines for more options:
    # https://rich.readthedocs.io/en/latest/index.html
    "theme": {
        # Change timestamp color
        "logging.time": "bright_cyan",
        # Add more named styles from Rich for your own use
        "logging.level.error": "bold red",
    },
    # which theme key to use for the timestamp
    "time_style_key": "logging.time",
    "rich": {
        # you can also inject RichHandler flags here later without code changes
        "show_time": True,
        "show_path": False,
    },
    "file": {
        "when": "midnight",
        "backupCount": 10,
        "fmt": "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
    },
}


# pylint: disable=too-many-instance-attributes
class NsFlowRunner:
    """Manages the Neuro SAN server and FastAPI backend."""

    def __init__(self):
        self.is_windows = os.name == "nt"
        self.server_process = None
        self.fastapi_process = None

        # Ensure correct paths
        this_dir = os.path.dirname(os.path.abspath(__file__))
        self.root_dir = os.path.dirname(this_dir)
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.info("root: %s", self.root_dir)

        # Load environment variables from .env
        self.load_env_variables()

        # Use paths relative to the root directory
        logs_dir_path = os.path.join(self.root_dir, "logs")
        thinking_dir_path = os.path.join(logs_dir_path, "thinking_dir")
        thinking_file_path = os.path.join(thinking_dir_path, "agent_thinking.txt")

        # Default Configuration
        self.config: Dict[str, Any] = {
            "server_host": os.getenv("NEURO_SAN_SERVER_HOST", "localhost"),
            "server_grpc_port": int(os.getenv("NEURO_SAN_SERVER_GRPC_PORT", "30011")),
            "server_http_port": int(os.getenv("NEURO_SAN_SERVER_HTTP_PORT", "8080")),
            "server_connection": str(os.getenv("NEURO_SAN_SERVER_CONNECTION", "http")),
            "manifest_update_period_seconds": int(os.getenv("AGENT_MANIFEST_UPDATE_PERIOD_SECONDS", "5")),
            "default_sly_data": str(os.getenv("DEFAULT_SLY_DATA", "")),
            "nsflow_host": os.getenv("NSFLOW_HOST", "localhost"),
            "nsflow_port": int(os.getenv("NSFLOW_PORT", "4173")),
            "nsflow_log_level": os.getenv("NSFLOW_LOG_LEVEL", "info"),
            "vite_api_protocol": os.getenv("VITE_API_PROTOCOL", "http"),
            "vite_ws_protocol": os.getenv("VITE_WS_PROTOCOL", "ws"),
            "thinking_file": os.getenv("THINKING_FILE", thinking_file_path),
            "thinking_dir": os.getenv("THINKING_DIR", thinking_dir_path),
            # Ensure all paths are resolved relative to `self.root_dir`
            "agent_manifest_file": os.getenv(
                "AGENT_MANIFEST_FILE", os.path.join(self.root_dir, "registries", "manifest.hocon")
            ),
            "agent_tool_path": os.getenv("AGENT_TOOL_PATH", os.path.join(self.root_dir, "coded_tools")),
            "nsflow_log_dir": logs_dir_path,
        }

        # Set up logging
        os.makedirs(logs_dir_path, exist_ok=True)
        os.makedirs(thinking_dir_path, exist_ok=True)

        self.log_bridge = ProcessLogBridge(
            level=self.config.get("nsflow_log_level", "info"),
            runner_log_file=os.path.join(self.config["nsflow_log_dir"], "runner.log"),
            config=log_cfg,
        )

        # Parse CLI args
        self.config.update(self.parse_args())
        if self.config["dev"]:
            os.environ["NSFLOW_DEV_MODE"] = "True"

    def load_env_variables(self):
        """Load .env file from project root and set variables."""
        env_path = os.path.join(self.root_dir, ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
            self.logger.info("Loaded environment variables from: %s", env_path)
        else:
            self.logger.warning("No .env file found at %s. \nUsing defaults.\n", env_path)

    def parse_args(self):
        """Parses command-line arguments for configuration."""
        parser = argparse.ArgumentParser(
            description="Run Neuro SAN server and FastAPI backend.",
            formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        )

        parser.add_argument(
            "--server-host", type=str, default=self.config["server_host"], help="Host address for the Neuro SAN server"
        )
        parser.add_argument(
            "--server-port", type=int, default=self.config["server_http_port"], help="Neuro SAN server port"
        )
        group = parser.add_argument_group(title="Session Type", description="How will we connect to neuro-san?")
        group.add_argument(
            "--connection",
            default="http",
            type=str,
            choices=["grpc", "http", "https"],
            help="""
The type of connection to initiate. Choices are to connect to:
    "grpc"      - an agent service via gRPC. Needs host and port.
    "http"      - an agent service via HTTP. Needs host and port.
    "https"     - an agent service via secure HTTP. Needs host and port.
""",
        )
        group.add_argument(
            "--grpc", dest="connection", action="store_const", const="grpc", help="Use a gRPC service connection"
        )
        group.add_argument(
            "--http", dest="connection", action="store_const", const="http", help="Use a HTTP service connection"
        )
        group.add_argument(
            "--https",
            dest="connection",
            action="store_const",
            const="https",
            help="Use a secure HTTP service connection. "
            "Requires your agent server to be set up with certificates that are well known. "
            "This is not something that our basic server setup supports out-of-the-box.",
        )
        parser.add_argument(
            "--default-sly-data",
            type=str,
            default=self.config["default_sly_data"],
            help="JSON string containing data that is out-of-band to the chat stream, "
            "but is still essential to agent function",
        )
        parser.add_argument(
            "--nsflow-host",
            type=str,
            default=self.config["nsflow_host"],
            help="Host address for the Fastapi based nsflow client",
        )
        parser.add_argument(
            "--nsflow-port",
            type=int,
            default=self.config["nsflow_port"],
            help="Port for the Fastapi based nsflow client",
        )
        parser.add_argument(
            "--nsflow-log-level", type=str, default=self.config["nsflow_log_level"], help="Log level for FastAPI"
        )
        parser.add_argument("--dev", action="store_true", help="Use dev port for FastAPI")
        parser.add_argument(
            "--thinking-file", type=str, default=self.config["thinking_file"], help="Path to the agent thinking file"
        )
        parser.add_argument(
            "--thinking-dir", type=str, default=self.config["thinking_dir"], help="Path to the agent thinking dir"
        )
        parser.add_argument(
            "--client-only", action="store_true", help="Run only the nsflow client without NeuroSan server"
        )
        parser.add_argument(
            "--server-only", action="store_true", help="Run only the NeuroSan server without nsflow client"
        )

        args, _ = parser.parse_known_args()
        explicitly_passed_args = {arg for arg in sys.argv[1:] if arg.startswith("--")}

        if args.client_only and (
            "--server-host" in explicitly_passed_args or "--server-port" in explicitly_passed_args
        ):
            parser.error("[x] You cannot specify --server-host or --server-port " "when using --client-only mode.")

        if args.server_only and (
            "--nsflow-host" in explicitly_passed_args or "--nsflow-port" in explicitly_passed_args
        ):
            parser.error("[x] You cannot specify --nsflow-host or --nsflow-port " "when using --server-only mode.")

        if args.client_only and args.server_only:
            parser.error("[x] You cannot specify both --client-only and --server-only at the same time.")

        return vars(args)

    def set_environment_variables(self):
        """Set required environment variables based on active mode."""
        os.environ["PYTHONPATH"] = self.root_dir

        # Common envs
        common_env = {
            "THINKING_FILE": "thinking_file",
            "THINKING_DIR": "thinking_dir",
            "AGENT_MANIFEST_FILE": "agent_manifest_file",
            "NSFLOW_LOG_DIR": "nsflow_log_dir",
            "NEURO_SAN_SERVER_CONNECTION": "server_connection",
            "AGENT_MANIFEST_UPDATE_PERIOD_SECONDS": "manifest_update_period_seconds",
        }

        client_env = {
            "NSFLOW_HOST": "nsflow_host",
            "NSFLOW_PORT": "nsflow_port",
            "NSFLOW_LOG_LEVEL": "nsflow_log_level",
            "NSFLOW_DEV_MODE": "dev",
            "NSFLOW_CLIENT_ONLY": "client_only",
            "VITE_API_PROTOCOL": "vite_api_protocol",
            "VITE_WS_PROTOCOL": "vite_ws_protocol",
        }

        server_env = {
            "NEURO_SAN_SERVER_HOST": "server_host",
            "NEURO_SAN_SERVER_GRPC_PORT": "server_grpc_port",
            "NEURO_SAN_SERVER_HTTP_PORT": "server_http_port",
            "AGENT_TOOL_PATH": "agent_tool_path",
            "NSFLOW_SERVER_ONLY": "server_only",
            "DEFAULT_SLY_DATA": "default_sly_data",
        }

        self.logger.info("\n" + "=" * 50)
        self.logger.info("Setting environment variables based on mode")

        # Always apply common
        self._apply_env(common_env)

        # Conditionally apply mode-specific env vars
        if self.config.get("client_only"):
            self.logger.info("Running in CLIENT-ONLY mode")
            self._apply_env(client_env)

        elif self.config.get("server_only"):
            self.logger.info("Running in SERVER-ONLY mode")
            self._apply_env(server_env)

        else:
            self.logger.info("Running in FULL mode (client + server)")
            self._apply_env(client_env)
            self._apply_env(server_env)

        self.logger.info("Environment variables set successfully.")
        self.logger.info("\n" + "=" * 50 + "\n")

    def _apply_env(self, mapping: Dict[str, str]):
        """Helper to apply config values to environment variables."""
        for env_var, config_key in mapping.items():
            value = self.config.get(config_key)
            if value is not None:
                os.environ[env_var] = str(value)
                self.logger.info("%s: %s", env_var, os.environ[env_var])
            else:
                self.logger.warning("Config key '%s' not found for env var '%s'", config_key, env_var)

    def start_process(self, command, process_name, log_file):
        """Start a subprocess and hook our log bridge (no run.py streaming)."""
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if self.is_windows else 0

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            preexec_fn=None if self.is_windows else os.setpgrp,
            creationflags=creation_flags,
        )

        self.logger.info("Started %s with PID %s (tee -> %s)", process_name, process.pid, log_file)

        # Let log_bridge own reading/parsing/printing/writing
        self.log_bridge.attach_process_logger(process, process_name, log_file)
        return process

    def start_neuro_san(self):
        """Start the Neuro SAN server."""
        self.logger.info("Starting Neuro SAN server...")
        command = [
            sys.executable,
            "-u",
            "-m",
            "neuro_san.service.main_loop.server_main_loop",
            "--http_port",
            str(self.config["server_http_port"]),
        ]
        self.server_process = self.start_process(
            command, "Neuro SAN", os.path.join(self.config["nsflow_log_dir"], "server.log")
        )
        self.logger.info("NeuroSan server started on port: %s", self.config["server_http_port"])

    def start_fastapi(self):
        """Start FastAPI backend."""
        self.logger.info("Starting FastAPI backend...")
        command = [
            sys.executable,
            "-m",
            "uvicorn",
            "nsflow.backend.main:app",
            "--host",
            self.config["nsflow_host"],
            "--port",
            str(self.config["nsflow_port"]),
            "--log-level",
            self.config["nsflow_log_level"],
            "--reload",
        ]

        self.fastapi_process = self.start_process(
            command, "FastAPI", os.path.join(self.config["nsflow_log_dir"], "api.log")
        )
        self.logger.info("FastAPI started on port: %s", self.config["nsflow_port"])

    def signal_handler(self, signum, frame):
        """Handle termination signals for cleanup."""
        self.logger.info("\n" + "=" * 50 + "\nTermination signal received. Stopping all processes...")

        if self.server_process:
            self.logger.info("Stopping Neuro SAN (PID: %s)...", self.server_process.pid)
            if self.is_windows:
                self.server_process.terminate()
            else:
                os.killpg(os.getpgid(self.server_process.pid), signal.SIGKILL)

        if self.fastapi_process:
            self.logger.info("Stopping FastAPI (PID: %s)...", self.fastapi_process.pid)
            if self.is_windows:
                self.fastapi_process.terminate()
            else:
                os.killpg(os.getpgid(self.fastapi_process.pid), signal.SIGKILL)

        sys.exit(0)

    def is_port_open(self, host: str, port: int, timeout=1.0) -> bool:
        """
        Check if a port is open on a given host.
        :param host: The hostname or IP address.
        :param port: The port number to check.
        :param timeout: Timeout in seconds for the connection attempt.
        :return: True if the port is open, False otherwise.
        """
        # Create a socket and set a timeout
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            try:
                sock.connect((host, port))
                return True
            except Exception:
                return False

    def conditional_start_servers(self):
        """Start both neuro-san and nsflow basis given conditions"""
        # Handle mutually exclusive modes
        client_only = self.config["client_only"]
        server_only = self.config["server_only"]

        if client_only and server_only:
            self.logger.error("Cannot use --client-only and --server-only together.")
            sys.exit(1)

        if not server_only:
            if self.config["nsflow_host"] == "localhost" and self.is_port_open(
                self.config["nsflow_host"], self.config["nsflow_port"]
            ):
                self.logger.error(
                    "\n" + "=" * 50 + "\nCannot start nsflow client while the port %s is already in use.\n" + "=" * 50,
                    self.config["nsflow_port"],
                )
            else:
                self.start_fastapi()
                self.logger.info("NSFlow client is now running.")

        if not client_only:
            if self.config["server_host"] == "localhost" and self.is_port_open(
                self.config["server_host"], self.config["server_http_port"]
            ):
                self.logger.error(
                    "\n"
                    + "=" * 50
                    + "\nCannot start neuro-san server while the port %s is already in use.\n"
                    + "=" * 50,
                    self.config["server_http_port"],
                )
            else:
                self.start_neuro_san()
                time.sleep(3)  # Give the server time to initialize
                self.logger.info("Neuro-San server is now running.")

    def run(self):
        """Run the Neuro SAN server and FastAPI backend based on CLI arguments."""
        if self.config["dev"]:
            self.config["nsflow_port"] = 8005
        self.logger.info("Starting Backend System...")
        log_config_blob = "\n".join(f"{key}: {value}" for key, value in self.config.items())
        self.logger.info("\nRun Config:\n%s\n", log_config_blob)

        # Set environment variables
        self.set_environment_variables()

        # Set up signal handling
        signal.signal(signal.SIGINT, self.signal_handler)
        if not self.is_windows:
            signal.signal(signal.SIGTERM, self.signal_handler)

        self.conditional_start_servers()

        self.logger.info("Press Ctrl+C to stop any running processes.")
        self.logger.info("\n" + "=" * 50 + "\n")

        # Wait on active subprocesses
        if self.server_process:
            self.server_process.wait()
        if self.fastapi_process:
            self.fastapi_process.wait()


if __name__ == "__main__":
    runner = NsFlowRunner()
    runner.run()
