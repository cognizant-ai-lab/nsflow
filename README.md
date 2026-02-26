# nsflow - A FastAPI powered client and IDE for Neuro-San

A fastapi and react based developer-oriented client and IDE that enables users to explore, visualize, and interact with smart agent networks. It integrates with [**NeuroSan**](https://github.com/cognizant-ai-lab/neuro-san) for intelligent agent-based interactions.

> [!TIP]
> To see how `nsflow` works in conjunction with the neuro-san library, visit [https://github.com/cognizant-ai-lab/neuro-san-studio](https://github.com/cognizant-ai-lab/neuro-san-studio)

> [!TIP]
> For a production oriented client for neuro-san, visit [https://github.com/cognizant-ai-lab/neuro-san-ui](https://github.com/cognizant-ai-lab/neuro-san-ui)


## Intro

`nsflow` comes with an **Agent Network Designer** that embodies the agentic design philosophy, making the neuro-san library accessible to both developers and non-developers alike. This transforms nsflow from a simple interactive chat client into a well-featured agent orchestration platform with visual design capabilities.

![Project Snapshot](https://raw.githubusercontent.com/cognizant-ai-lab/nsflow/main/docs/snapshot01.png)

---

## **Enabling/Disabling text-to-speech and speech-to-text**

For local development (when running the backend and frontend separately), you can toggle text-to-speech and speech-to-text by setting the VITE_USE_SPEECH variable in the nsflow/frontend/.env.development file to "true" or "false".  
The frontend development server reads this file directly.

---

## **Installation & Running nsflow**

**nsflow** can be installed and run in **two different ways:**

### **1️⃣ Run nsflow using pypi package**
To simplify execution, nsflow provides a CLI command to start both the backend and frontend simultaneously.

#### **Step 1: Create and source a virtual environment**
```bash
python -m venv .venv
source .venv/bin/activate
```

#### **Step 2: Install nsflow from pip**
```bash
pip install nsflow
```

#### **Step 3: Run Everything with a Single Command**
```bash
python -m nsflow.run
```

By default, this will start:
- **backend** (FastAPI + NeuroSan) here: `http://127.0.0.1:4173/docs` or `http://127.0.0.1:4173/redoc`
- **frontend** (React) here: `http://127.0.0.1:4173`

---

### **2️⃣ Development & Contribution (Manually Start Frontend & Backend)**
If you want to contribute, ensure you have the necessary dependencies installed. 
To start the frontend and backend separately, follow these steps:

#### **Step 1: Clone the Repository**
```bash
git clone https://github.com/cognizant-ai-lab/nsflow.git
cd nsflow
```

#### **Step 2: Install Dependencies**
- Make sure you have python (preferably **Python 3.12**) installed.
    ```bash
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pip install -r requirements-build.txt
    ```

#### **Step 3: Start the Backend in dev mode & Frontend separately**
- Ensure that you have a few example hocon files in your `registries` and the same mapped in `registries/manifest`.
- [Optional] Ensure that you have the necessary coded tools in the `coded_tools` dir.

- From the root start Backend:
    ```bash
    python -m nsflow.run --dev
    ```

- Start Frontend:
    - Ensure that you have **Node.js (with Yarn)** installed.
    - Follow the instructions to setup the frontend here: [./nsflow/frontend/README.md](https://github.com/cognizant-ai-lab/nsflow/tree/main/nsflow/frontend/README.md)
    - On another terminal window
        ```bash
        cd nsflow/frontend; yarn install
        yarn dev
        ```

- By default:
    - **backend** will be available at: `http://127.0.0.1:8005`
    - **frontend** will be available at: `http://127.0.0.1:5173`
    - You may change the host/port configs using environment variables for fastapi (refer [run.py](./nsflow/run.py)) and using [frontend/.env.development](./nsflow/frontend/.env.development) for react app


#### **Step 4: To make sure your changes to frontend take effect in the wheel, run the script**

- To build the Frontend
    ```bash
    sh build_scripts/build_frontend.sh
    ```

Note: The above script's output should show that `./nsflow` dir contains a module `prebuilt_frontend`

- To build and test the wheel locally
    ```bash
    sh build_scripts/build_wheel.sh
    ```


## For using Text-to-Speech and Speech-to-Text
Prerequisite: install `ffmpeg` for text-to-speech and speech-to-text support

- On Mac
```bash
brew install ffmpeg
```

- On Linux
```bash
sudo apt install ffmpeg
```

- On windows, follow the [instructions](https://phoenixnap.com/kb/ffmpeg-windows) here.

---

### Enabling Visual Question Answering (VQA) http endpoints

Follow these [instructions](./docs/VQA_README.md)
