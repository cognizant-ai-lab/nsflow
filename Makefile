
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT

PYTHON := python3
REQUIRED_VERSION := 3.10
MAX_VERSION := 3.13

PYTHON_VERSION := $(shell $(PYTHON) -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')


check_python_version:
	@echo "Checking Python version..."
	@$(PYTHON) -c 'import sys; v=sys.version_info; \
		assert (v.major == 3 and 10 <= v.minor < 13), \
		f"Python >=3.10,<3.13 required, but found {v.major}.{v.minor}"; \
		print(f"{v}\n✔ Python version is compatible.")'

venv: check_python_version ## Set up a virtual environment in project
	@if [ ! -d ".venv" ]; then \
		echo "Creating virtual environment in ./.venv..."; \
		python -m venv .venv; \
		echo "Virtual environment created."; \
	else \
		echo "Virtual environment already exists."; \
	fi

install: venv ## Install all dependencies in the virtual environment
	@echo "Installing all dependencies including test dependencies in virtual environment..."
	@. venv/bin/activate && pip install --upgrade pip
	@. venv/bin/activate && pip install -r requirements.txt -r requirements-build.txt
	@echo "All dependencies including test dependencies installed successfully."

activate: ## Activate the venv
	@if [ ! -d "venv" ]; then \
		echo "No virtual environment detected..."; \
		echo "To create a virtual environment and install dependencies, run:"; \
		echo "    make install"; \
		echo ""; \
	else \
		echo "To activate the environment in your current shell, run:"; \
		echo "    source venv/bin/activate"; \
		echo ""; \
	fi

lint: ## Run code formatting and linting tools on source
	@if [ -z "$$VIRTUAL_ENV" ]; then \
		echo ""; \
		echo "Error: Linting must be run using a Python virtual environment"; \
		echo "Please activate the correct environment for example:"; \
		echo "  source venv/bin/activate"; \
		echo ""; \
		exit 1; \
	fi
	isort run.py coded_tools/ --force-single-line
	black run.py coded_tools/
	flake8 run.py coded_tools/
	pylint run.py coded_tools/

lint-tests: ## Run code formatting and linting tools on tests
	@if [ -z "$$VIRTUAL_ENV" ]; then \
		echo ""; \
		echo "Error: Linting must be run using a Python virtual environment"; \
		echo "Please activate the correct environment for example:"; \
		echo "  source venv/bin/activate"; \
		echo ""; \
		exit 1; \
	fi
	isort tests/ --force-single-line
	black tests/
	flake8 tests/
	pylint tests/

test: lint lint-tests ## Run tests with coverage
	python -m pytest tests/ -v --cov=coded_tools,run.py

.PHONY: help venv install activate lint lint-tests test
.DEFAULT_GOAL := help

help: ## Show this help message and exit
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[m %s\n", $$1, $$2}'
