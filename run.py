import os
import sys
import signal
import subprocess
import argparse
import threading
import socket
import logging
import time

class NsFlowRunner:
    """Manages the Neuro SAN server and FastAPI backend."""

    def __init__(self):
        self.is_windows = os.name == "nt"
        self.server_process = None
        self.fastapi_process = None

        # Default Configuration
        self.ns_server_host = "localhost"
        self.ns_server_port = 30011
        self.ns_agent_name = "airline_policy"
        self.api_host = "localhost"
        self.api_port = 8000
        self.api_log_level = "info"
        self.thinking_file = "C:\\tmp\\agent_thinking.txt" if self.is_windows else "/tmp/agent_thinking.txt"

        self.config = self.parse_args()

        # Set up logging
        self.log_dir = "logs"
        os.makedirs(self.log_dir, exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(os.path.join(self.log_dir, "runner.log"), mode="a")
            ]
        )

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
        parser.add_argument('--demo-mode', action='store_true', 
                            help="Run in demo mode with default Neuro SAN settings")

        return vars(parser.parse_args())

    def set_environment_variables(self):
        """Set required environment variables."""
        os.environ["PYTHONPATH"] = os.getcwd()

        if self.config["demo_mode"]:
            os.environ.pop("AGENT_MANIFEST_FILE", None)
            os.environ.pop("AGENT_TOOL_PATH", None)
            print("Running in **Demo Mode** - Using default neuro-san settings")
        else:
            os.environ["AGENT_MANIFEST_FILE"] = "./registries/manifest.hocon"
            os.environ["AGENT_TOOL_PATH"] = "./coded_tools"

        logging.info(f"AGENT_MANIFEST_FILE: {os.getenv('AGENT_MANIFEST_FILE')}")
        logging.info(f"AGENT_TOOL_PATH: {os.getenv('AGENT_TOOL_PATH')}")

    def find_available_port(self, start_port):
        """Find the next available port starting from `start_port`."""
        port = start_port
        while True:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", port)) != 0:
                    logging.info(f"Using available port: {port}")
                    return port
            port += 1

    def start_process(self, command, process_name, log_file):
        """Start a subprocess and capture logs."""
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if self.is_windows else 0

        with open(log_file, "w") as log:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, bufsize=1, universal_newlines=True,
                                       preexec_fn=None if self.is_windows else os.setpgrp,
                                       creationflags=creation_flags)

        logging.info(f"Started {process_name} with PID {process.pid}")

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
        logging.info(f"Neuro SAN server started on port {self.config['server_port']}.")

    def start_fastapi(self):
        """Start FastAPI backend."""
        logging.info("Starting FastAPI backend...")

        # Check if the port is available, otherwise find the next free one
        # self.config["api_port"] = self.find_available_port(self.config["api_port"])

        command = [
            sys.executable, "-m", "uvicorn", "backend.main:app",
            "--host", self.config["api_host"],
            "--port", str(self.config["api_port"]),
            "--log-level", self.config["log_level"],
            "--reload"
        ]

        self.fastapi_process = self.start_process(command, "FastAPI", os.path.join(self.log_dir, "api.log"))
        logging.info(f"FastAPI started on port {self.config['api_port']}.")

    def signal_handler(self, signum, frame):
        """Handle termination signals for cleanup."""
        logging.info("\nTermination signal received. Stopping all processes...")

        if self.server_process:
            logging.info(f"Stopping Neuro SAN (PID {self.server_process.pid})...")
            if self.is_windows:
                self.server_process.terminate()
            else:
                os.killpg(os.getpgid(self.server_process.pid), signal.SIGKILL)

        if self.fastapi_process:
            logging.info(f"Stopping FastAPI (PID {self.fastapi_process.pid})...")
            if self.is_windows:
                self.fastapi_process.terminate()
            else:
                os.killpg(os.getpgid(self.fastapi_process.pid), signal.SIGKILL)

        sys.exit(0)

    def run(self):
        """Run the Neuro SAN server and FastAPI backend."""
        logging.info("Starting Backend System...")
        logging.info("\nRun Config:\n" + "\n".join(f"{key}: {value}" for key, value in self.config.items()) + "\n")

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
        logging.info("NsFlowRunner is now running.")

        # Wait for both processes
        self.server_process.wait()
        self.fastapi_process.wait()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    runner = NsFlowRunner()
    runner.run()
