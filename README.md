# nsflow - A FastAPI based client for NeuroSan

Note: To see and use how nsflow client works along with neuro-san library, please visit [https://github.com/cognizant-ai-lab/neuro-san-studio](https://github.com/cognizant-ai-lab/neuro-san-studio)


**nsflow** is a react-based developer-oriented client that enables users to explore, visualize, and interact with smart agent networks. It integrates with [**NeuroSan**](https://github.com/cognizant-ai-lab/neuro-san) for intelligent agent-based interactions.

![Project Snapshot](https://raw.githubusercontent.com/cognizant-ai-lab/nsflow/main/docs/snapshot01.png)

---

## **Enabling/Disabling text-to-speech and speech-to-text**

For local development (when you run the backend and frontend separately), you should set VITE_USE_SPEECH in the nsflow/frontend/.env.development file to "true" or "false" to enable/disable text-to-speech and speech-to-text. The frontend development server reads this file directly.

For a production build (when you run the application using python -m nsflow.run without the --dev flag), you would set USE_SPEECH to "true" or "false" in your main .env file. The run.py script then automatically passes this setting to the frontend.

---

## **Installation & Running nsflow**

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
    pip install -r requirements-dev.txt
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
---
