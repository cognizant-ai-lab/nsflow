#!/bin/bash

# Set frontend build path
FRONTEND_BUILD_PATH="nsflow/prebuilt_frontend"

# Function to clean directories
clean_dirs() {
    local dir="$1"
    echo "Cleaning destination directory: $dir"
    if [ -d "$dir" ]; then
        rm -rf "$dir"/*
    else
        mkdir -p "$dir"
    fi
}

# Function to add __init__.py to all directories
add_init_files() {
    local base_dir="$1"
    echo "Adding __init__.py to all subdirectories in $base_dir..."
    find "$base_dir" -type d -exec touch {}/__init__.py \;
}

# Build frontend
echo "=== Building Frontend ==="
cd nsflow/frontend || { echo "Error: Could not navigate to 'frontend' directory."; exit 1; }

CI='' yarn build 2>&1 || { echo -e "\nBuild failed."; exit 1; }

cd ../..  # Move back to project root

# Clean and move frontend build files
clean_dirs "$FRONTEND_BUILD_PATH"
echo "Moving build files to $FRONTEND_BUILD_PATH..."
cp -r nsflow/frontend/dist/. "$FRONTEND_BUILD_PATH"

# Add __init__.py to all directories inside frontend build
add_init_files "$FRONTEND_BUILD_PATH"

echo "==== Completed Building Frontend ===="
