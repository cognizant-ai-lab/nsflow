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

install:
	@echo "Installing dependencies..."
	@$(UV) sync --frozen
	@echo "Dependencies installed successfully."
	uv venv .venv
	source .venv/bin/activate && uv pip install -e .
	cd frontend && yarn install

build:
	yarn build --cwd frontend
	uv build

# Package into a wheel file
package:
	uv build

# Publish to PyPI
publish:
	uv publish

# Run tests
test:
	pytest tests/

run:
	nsflow run

clean:
	@echo "Cleaning Python cache..."
	rm -rf build dist .venv logs
	find . -name "*.pyc" -delete
	find . -type d -name '__pycache__' -exec rm -r {} +
	find . -type f -name '*.py[cod]' -exec rm -f {} +
	find . -type f -name '*~' -exec rm -f {} +
	find . -type f -name '.*~' -exec rm -f {} +
	@echo "Python cache cleaned."
	
## Show help message
help:
	@echo "Available commands:"
	@grep -hE '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*?##' '{printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

docker-build:
	docker build -t nsflow .

docker-run:
	docker run -p 8000:8000 -p 5173:5173 nsflow
