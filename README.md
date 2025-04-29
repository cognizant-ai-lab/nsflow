# nsflow - A FastAPI based client for NeuroSan

**nsflow** is a react-based developer-oriented client that enables users to explore, visualize, and interact with smart agent networks. It integrates with [**NeuroSan**](https://github.com/leaf-ai/neuro-san) for intelligent agent-based interactions.

![Project Snapshot](https://raw.githubusercontent.com/leaf-ai/nsflow/main/docs/snapshot01.png)

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
If you want to contribute, ensure you have the necessary dependencies installed:
To start the frontend and backend separately, follow these steps:

#### **Step 1: Clone the Repository**
```bash
git clone https://github.com/leaf-ai/nsflow.git
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
- From the root start Backend:
    ```bash
    python -m nsflow.run --dev
    ```

- Start Frontend:
    - Ensure that you have **Node.js (with Yarn)** installed.
    - Follow the instructions to setup the frontend here: [./nsflow/frontend/README.md](https://github.com/leaf-ai/nsflow/tree/main/nsflow/frontend/README.md)
    - On another terminal window
        ```bash
        cd nsflow/frontend; yarn install
        yarn dev
        ```

- By default:
    - **backend** will be available at: `http://127.0.0.1:8005`
    - **frontend** will be available at: `http://127.0.0.1:5173`


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
