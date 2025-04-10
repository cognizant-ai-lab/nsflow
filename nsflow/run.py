
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import os
import sys
import signal
import subprocess
import argparse
import threading
import socket
import logging
import time
from dotenv import load_dotenv


# pylint: disable=too-many-instance-attributes
class NsFlowRunner:
    """Manages the Neuro SAN server and FastAPI backend."""

    def __init__(self):
        self.is_windows = os.name == "nt"
        self.server_process = None
        self.fastapi_process = None

        # Ensure correct paths
        self.root_dir = os.getcwd()
        logging.info("root: %s", self.root_dir)

        # Load environment variables from .env
        self.load_env_variables()

        # Default Configuration
        self.ns_server_host = os.getenv("NS_SERVER_HOST", "localhost")
        self.ns_server_port = int(os.getenv("NS_SERVER_PORT", "30015"))
        self.api_host = os.getenv("API_HOST", "localhost")
        self.api_port = int(os.getenv("API_PORT", "4173"))
        self.api_log_level = os.getenv("API_LOG_LEVEL", "info")
        self.thinking_file = "C:\\tmp\\agent_thinking.txt" if self.is_windows else "/tmp/agent_thinking.txt"

        # Ensure all paths are resolved relative to `self.root_dir`
        self.agent_manifest_file = os.getenv("AGENT_MANIFEST_FILE",
                                             os.path.join(self.root_dir, "registries", "manifest.hocon"))
        self.agent_tool_path = os.getenv("AGENT_TOOL_PATH",
                                         os.path.join(self.root_dir, "coded_tools"))

        self.log_dir = os.path.join(self.root_dir, "logs")
        os.makedirs(self.log_dir, exist_ok=True)

        # Set up logging
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(os.path.join(self.log_dir, "runner.log"), mode="a")
            ]
        )

        # Parse CLI args
        self.config = self.parse_args()
        if self.config["dev"]:
            os.environ["DEV_MODE"] = "True"

    def load_env_variables(self):
        """Load .env file from project root and set variables."""
        env_path = os.path.join(self.root_dir, ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
            logging.info("Loaded environment variables from: %s", env_path)
        else:
            logging.warning("No .env file found at %s. \nUsing defaults.\n", env_path)

    def parse_args(self):
        """Parses command-line arguments for configuration."""
        parser = argparse.ArgumentParser(description="Run Neuro SAN server and FastAPI backend.")

        parser.add_argument('--server-host', type=str, default=self.ns_server_host,
                            help="Host address for the Neuro SAN server")
        parser.add_argument('--server-port', type=int, default=self.ns_server_port,
                            help="Neuro SAN server port")
        parser.add_argument('--api-host', type=str, default=self.api_host,
                            help="Host address for the Fastapi API")
        parser.add_argument('--api-port', type=int, default=self.api_port,
                            help="FastAPI server port")
        parser.add_argument('--log-level', type=str, default=self.api_log_level,
                            help="Log level for FastAPI")
        parser.add_argument('--dev', action='store_true',
                            help="Use dev port for FastAPI")
        parser.add_argument('--demo-mode', action='store_true',
                            help="Run in demo mode with default Neuro SAN settings")

        return vars(parser.parse_args())

    def set_environment_variables(self):
        """Set required environment variables."""
        os.environ["PYTHONPATH"] = self.root_dir

        if self.config["demo_mode"]:
            os.environ.pop("AGENT_MANIFEST_FILE", None)
            os.environ.pop("AGENT_TOOL_PATH", None)
            print("Running in **Demo Mode** - Using default neuro-san settings")
        else:
            os.environ["AGENT_MANIFEST_FILE"] = self.agent_manifest_file
            os.environ["AGENT_TOOL_PATH"] = self.agent_tool_path

        logging.info("AGENT_MANIFEST_FILE: %s", os.getenv('AGENT_MANIFEST_FILE'))
        logging.info("AGENT_TOOL_PATH: %s", os.getenv('AGENT_TOOL_PATH'))

    def find_available_port(self, start_port):
        """Find the next available port starting from `start_port`."""
        port = start_port
        while True:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", port)) != 0:
                    logging.info("Using available port: %s", port)
                    return port
            port += 1

    def start_process(self, command, process_name, log_file):
        """Start a subprocess and capture logs."""
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if self.is_windows else 0

        with open(log_file, "w", encoding="utf-8") as log:  # noqa: F841
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, bufsize=1, universal_newlines=True,
                                       preexec_fn=None if self.is_windows else os.setpgrp,
                                       creationflags=creation_flags)

        logging.info("Started %s with PID %s", process_name, process.pid)

        # Start log streaming in a thread
        threading.Thread(target=self.stream_output, args=(process.stdout, log_file, process_name)).start()
        threading.Thread(target=self.stream_output, args=(process.stderr, log_file, process_name)).start()

        return process

    def stream_output(self, pipe, log_file, prefix):
        """Stream process output to console and log file."""
        with open(log_file, "a", encoding="utf-8") as log:
            for line in iter(pipe.readline, ''):
                formatted_line = f"{prefix}: {line.strip()}"
                print(formatted_line)
                log.write(formatted_line + "\n")
            # log.flush()
        pipe.close()

    def start_neuro_san(self):
        """Start the Neuro SAN server."""
        logging.info("Starting Neuro SAN server...")
        # Check if the port is available, otherwise find the next free one
        # self.config["server_port"] = self.find_available_port(self.config["server_port"])

        command = [
            sys.executable, "-u", "-m", "neuro_san.service.agent_main_loop",
            "--port", str(self.config["server_port"])
        ]
        self.server_process = self.start_process(command, "Neuro SAN", os.path.join(self.log_dir, "server.log"))
        logging.info("Neuro SAN server started on port: %s", self.config['server_port'])

    def start_fastapi(self):
        """Start FastAPI backend."""
        logging.info("Starting FastAPI backend...")

        # Check if the port is available, otherwise find the next free one
        # self.config["api_port"] = self.find_available_port(self.config["api_port"])
        command = [
            sys.executable, "-m", "uvicorn", "nsflow.backend.main:app",
            "--host", self.config["api_host"],
            "--port", str(self.config["api_port"]),
            "--log-level", self.config["log_level"],
            "--reload"
        ]

        self.fastapi_process = self.start_process(command, "FastAPI", os.path.join(self.log_dir, "api.log"))
        logging.info("FastAPI started on port: %s", self.config['api_port'])

    def signal_handler(self, signum, frame):
        """Handle termination signals for cleanup."""
        logging.info("\nTermination signal received. Stopping all processes...")

        if self.server_process:
            logging.info("Stopping Neuro SAN (PID: %s)...", self.server_process.pid)
            if self.is_windows:
                self.server_process.terminate()
            else:
                os.killpg(os.getpgid(self.server_process.pid), signal.SIGKILL)

        if self.fastapi_process:
            logging.info("Stopping FastAPI (PID: %s)...", self.fastapi_process.pid)
            if self.is_windows:
                self.fastapi_process.terminate()
            else:
                os.killpg(os.getpgid(self.fastapi_process.pid), signal.SIGKILL)

        sys.exit(0)

    def run(self):
        """Run the Neuro SAN server and FastAPI backend."""
        if self.config["dev"]:
            self.config["api_port"] = 8005
        logging.info("Starting Backend System...")
        log_config_blob = "\n".join(f"{key}: {value}" for key, value in self.config.items())
        logging.info("\nRun Config:\n%s\n", log_config_blob)

        # Set environment variables
        self.set_environment_variables()

        # Set up signal handling
        signal.signal(signal.SIGINT, self.signal_handler)
        if not self.is_windows:
            signal.signal(signal.SIGTERM, self.signal_handler)

        # Start processes
        self.start_neuro_san()
        time.sleep(3)  # Allow some time for Neuro SAN to initialize

        self.start_fastapi()
        logging.info("NSFlow is now running.")

        # Wait for both processes
        self.server_process.wait()
        self.fastapi_process.wait()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    runner = NsFlowRunner()
    runner.run()
