
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

# Lint/format targets. coded_tools, registries and middleware are gitignored (vendored
# from neuro-san-studio), so linting is scoped to the tracked nsflow package + tests.
SOURCES := nsflow
TESTS   := tests
# Aligned with neuro-san-studio: scan committed docs + README. (docs/superpowers/ is
# gitignored local-only and absent in CI checkouts.)
MARKDOWN := ./docs ./README.md

RUFF_FORMAT_CHECK := --check --diff
RUFF_LINT_CHECK := --output-format=full
RUFF_IMPORTS_FIX := --select I --fix


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

venv-guard:
	@if [ -z "$$VIRTUAL_ENV" ]; then \
		echo ""; \
		echo "Error: Linting must be run using a Python virtual environment"; \
		echo "Please activate the correct environment for example:"; \
		echo "  source .venv/bin/activate"; \
		echo ""; \
		exit 1; \
	fi

format-source: venv-guard ## Auto-format source and sort imports via ruff
	ruff check $(RUFF_IMPORTS_FIX) $(SOURCES)
	ruff format $(SOURCES)

format-tests: venv-guard ## Auto-format tests and sort imports via ruff
	ruff check $(RUFF_IMPORTS_FIX) $(TESTS)
	ruff format $(TESTS)

format: format-source format-tests ## Auto-format source and tests

lint-check-source: venv-guard ## Check formatting + lint source (ruff, pylint, pymarkdown)
	ruff format $(SOURCES) $(RUFF_FORMAT_CHECK)
	ruff check $(SOURCES) $(RUFF_LINT_CHECK)
	pylint --rcfile=pyproject.toml $(SOURCES)
	pymarkdown --config ./.pymarkdownlint.yaml scan $(MARKDOWN)

lint-check-tests: venv-guard ## Check formatting + lint tests (ruff, pylint)
	ruff format $(TESTS) $(RUFF_FORMAT_CHECK)
	ruff check $(TESTS) $(RUFF_LINT_CHECK)
	pylint --rcfile=pyproject.toml $(TESTS)

lint-check: lint-check-source lint-check-tests ## Non-mutating lint checks (used by CI)

lint: format lint-check ## Auto-format then run all lint checks (local convenience)

test: lint ## Run tests with coverage
	python -m pytest tests/ -v --cov=nsflow

.PHONY: help venv install activate venv-guard format-source format-tests format \
	lint-check-source lint-check-tests lint-check lint test check_python_version
.DEFAULT_GOAL := help

help: ## Show this help message and exit
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[m %s\n", $$1, $$2}'
