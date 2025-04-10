#!/bin/bash

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

echo "=== Starting Wheel Build ==="
# Set project root directory (one level up from build_scripts/)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Project Root: $PROJECT_ROOT"

# Verify test coverage
echo ">>Test Coverage"
pytest --cov-report term-missing --cov=nsflow
rm .coverage
echo ">>End of Test Coverage"

# Step 1: Clean up unwanted files
echo "Cleaning up old build artifacts..."
find "$PROJECT_ROOT" -name "__pycache__" -type d -exec rm -rf {} +
find "$PROJECT_ROOT" -name ".ipynb_checkpoints" -type d -exec rm -rf {} +
find "$PROJECT_ROOT" -name ".hypothesis" -type d -exec rm -rf {} + 
find "$PROJECT_ROOT" -name ".DS_Store" -type f -delete

# Step 2: Remove old build directories
echo "Removing old build directories..."
rm -rf "$PROJECT_ROOT/build" "$PROJECT_ROOT/dist" "$PROJECT_ROOT/nsflow.egg-info"

# Step 3: Build the wheel (allowing optional user arguments)
echo "Running Python build..."
cd "$PROJECT_ROOT" || { echo "Error: Could not navigate to project root."; exit 1; }

# Allows users to pass additional build arguments
python -m build --wheel "$@"

# Step 4: Verify the contents of the built wheel
echo "Verifying wheel contents..."
 # Get latest generated wheel file
WHEEL_FILE=$(ls -t "$PROJECT_ROOT/dist/"*.whl | head -n 1)
if [[ -f "$WHEEL_FILE" ]]; then
    echo "Built Wheel: $WHEEL_FILE"
    zipinfo -ls "$WHEEL_FILE"
else
    echo "Error: Wheel build failed."
    exit 1
fi

echo "=== Build complete! ==="
