.PHONY: all init install clean test run help

# Variables
PYTHON=python3
APP=app/main.py
REQUIREMENTS=requirements.txt
FRONTEND_BUILD_PATH=backend/build_fe

CLEAN_DIRS = $(foreach dir,$1,$(shell mkdir -p $(dir) && find $(dir) -mindepth 1 -delete))

# Default target
all: help

## Initialize the project
init: check_tools clean install ## Install dependencies and set up the project

## Check required tools
check_tools:
	@command -v uv >/dev/null 2>&1 || { echo >&2 "uv is not installed. Aborting."; exit 1; }
	@echo "All required tools are installed."

install: ## install all dependencies
	@echo "=== Installing backend dependencies ==="
	@uv sync --frozen
	@echo "Dependencies installed successfully."
	@uv venv .venv
	@source .venv/bin/activate && uv pip install -e .
	@echo "=== Installing frontend dependencies ==="
	@cd frontend && yarn install > /dev/null 2>&1



build:
	@echo "=== Building Frontend ==="
	@cd frontend && CI='' yarn build 2>&1 || { echo "\nBuild failed."; exit 1; }
	@echo 'Cleaning destination directory...'
	$(call CLEAN_DIRS,$(FRONTEND_BUILD_PATH))
	@echo 'Moving build files...'
	@cp -r frontend/dist/. $(FRONTEND_BUILD_PATH)
	@echo '==== Completed Building Frontend ===='
	@echo "=== Building Backend ==="
	uv lock 
	uv build $(args)
	@echo '==== Completed Building Backend ===='


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

