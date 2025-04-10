
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
# Base image
FROM python:3.12-slim

##############################################################
#                   Basic Housekeeping
##############################################################
LABEL maintainer="None"
ENV LANG C.UTF-8
ENV PYTHON_VERSION 3.12
ENV PIP_VERSION 25.0.1
ENV DEBIAN_FRONTEND noninteractive

# Install necessary system dependencies
RUN apt-get update -y && \
    apt-get install -y curl git yarn build-essential shellcheck && \
    rm -rf /var/lib/apt/lists/*

# Change EXTERNAL_BUILD_ROOT to . if debugging locally
ENV EXTERNAL_BUILD_ROOT .

# Set up leaf user
ARG USERNAME=leaf
RUN adduser --disabled-password --gecos '' ${USERNAME}

# Define the home directory for the application
ARG APP_HOME=/home/${USERNAME}

# Virtual environment path
ENV OUR_VENV ${APP_HOME}/venv/python-${PYTHON_VERSION}
ENV PATH="$OUR_VENV/bin:$PATH"

# Make the application directory
RUN mkdir -p ${APP_HOME}

# Set up Python virtual environment
RUN python${PYTHON_VERSION} -m venv $OUR_VENV && \
    pip3 install --upgrade pip==${PIP_VERSION} wheel virtualenv

# Define the external build root (for local debugging, set to ".")
ENV EXTERNAL_BUILD_ROOT ${APP_HOME}

# Define the repository source directory
ARG REPO=nsflow
ARG APP_SOURCE=${APP_HOME}/${REPO}
RUN mkdir -p ${APP_SOURCE}

##############################################################
#                   Install Python Dependencies
##############################################################

# Copy requirement files for efficient caching
COPY --chown=${USERNAME}:${USERNAME} ${EXTERNAL_BUILD_ROOT}/requirements-build.txt ${APP_SOURCE}
RUN pip3 install -r ${APP_SOURCE}/requirements-build.txt

COPY --chown=${USERNAME}:${USERNAME} ${EXTERNAL_BUILD_ROOT}/requirements.txt ${APP_SOURCE}
RUN pip3 install -r ${APP_SOURCE}/requirements.txt

# Install private dependencies using credentials from secrets
COPY --chown=${USERNAME}:${USERNAME} ${EXTERNAL_BUILD_ROOT}/requirements-private.txt ${APP_SOURCE}
RUN --mount=type=secret,id=with_creds_requirements \
    /bin/bash -c "pip3 install -r <(cat /run/secrets/with_creds_requirements)"

##############################################################
#                   Copy Project Source Code
##############################################################
COPY --chown=${USERNAME}:${USERNAME} . ${APP_SOURCE}

# Switch to leaf user
USER ${USERNAME}

# Set working directory
WORKDIR ${APP_SOURCE}

##############################################################
#                   Run Build Scripts
##############################################################

# Build Frontend
RUN ./build_scripts/build_frontend.sh

# Build Backend Wheel
RUN ./build_scripts/build_wheel.sh

# Ensure the built wheel exists
RUN ls -lah ${APP_SOURCE}/dist/

# Final working directory
WORKDIR ${APP_HOME}

##############################################################
#                   Define Runtime Command
##############################################################

# Set default command to run `nsflow.run` inside the container
ENTRYPOINT ["python", "-m", "nsflow.run"]
CMD []
