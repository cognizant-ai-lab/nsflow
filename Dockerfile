# Base image with Python and Node.js
FROM python:3.12

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y curl

# Install Python dependencies
COPY pyproject.toml
RUN pip install uv
RUN uv pip install -r <(uv pip compile pyproject.toml)

# Install Node.js dependencies
COPY frontend /app/frontend
WORKDIR /app/frontend
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install --global yarn && \
    yarn install && \
    yarn build

# Copy backend files
WORKDIR /app
COPY backend /app/backend
COPY run.py /app/run.py

# Expose API & frontend ports
EXPOSE 8000 5173

# Run both backend and frontend
CMD ["python", "-m", "nsflow.run"]
