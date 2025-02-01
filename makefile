.PHONY: all init install clean test run help

# Variables
PYTHON=python3
UV=uv
APP=app/main.py
REQUIREMENTS=requirements.txt

# Default target
all: help

## Initialize the project
init: check_tools clean install ## Install dependencies and set up the project

## Check required tools
check_tools:
	@command -v uv >/dev/null 2>&1 || { echo >&2 "uv is not installed. Aborting."; exit 1; }
	@echo "All required tools are installed."

## Install dependencies
install:
	@echo "Installing dependencies..."
	@$(UV) sync --frozen
	@echo "Dependencies installed successfully."

## Clean temporary files and caches
clean:
	@echo "Cleaning Python cache..."
	find . -type d -name '__pycache__' -exec rm -r {} +
	find . -type f -name '*.py[cod]' -exec rm -f {} +
	find . -type f -name '*~' -exec rm -f {} +
	find . -type f -name '.*~' -exec rm -f {} +
	@echo "Python cache cleaned."

## Run tests
test:
	@echo "Running tests..."
	pytest tests/

## Run the Streamlit app
run:
	@echo "Starting the Streamlit app..."
	streamlit run $(APP)

## Show help message
help:
	@echo "Available commands:"
	@grep -hE '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*?##' '{printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'
