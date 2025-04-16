# NSFlow - A FastAPI based client for NeuroSan

NSFlow is a framework that enables users to explore, visualize, and interact with smart agent networks. It integrates **NeuroSan** for intelligent agent-based interactions.

![Project Logo](docs/snapshot01.png)

---
## **Installation & Running NSFlow**

NSFlow can be installed and run in **three different ways:**

### **1️⃣ Run NSFlow using git repo**
To simplify execution, NSFlow provides a CLI command to start both the backend and frontend simultaneously.

#### **Step 1: Clone the repository**
```bash
git clone https://github.com/leaf-ai/nsflow.git
```

#### **Step 2: Install NSFlow dependencies**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-private.txt
```

#### **Step 3: Run Everything with a Single Command**
```bash
python -m nsflow.run
```

By default, this will start:
- **backend** (FastAPI + NeuroSan) here: `http://127.0.0.1:4173/docs` or `http://127.0.0.1:4173/redoc`
- **frontend** (React) here: `http://127.0.0.1:4173`

---

### **2️⃣ Run NSFlow with a Wheel**
You can run NSFlow inside a **Docker container**, which includes both the backend and frontend.

#### **Step 1: Build the Frontend**
```bash
sh build_scripts/build_frontend.sh
```

#### **Step 2: Build the Wheel**
```bash
sh build_scripts/build_wheel.sh
```

Note: The above script output should show that the wheel contains a module `prebuilt_frontend`

---

### **3️⃣ Development & Contribution (Manually Start Frontend & Backend)**
If you want to contribute, ensure you have the necessary dependencies installed:
To start the frontend and backend separately, follow these steps:

#### **Step 1: Clone the Repository**
```bash
git clone https://github.com/your-org/nsflow.git
cd nsflow
```

#### **Step 2: Install Dependencies**
Make sure you have **Python 3.12** and **Node.js (with Yarn)** installed.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-private.txt
cd frontend; yarn install
```

#### **Step 3: Start the Backend & Frontend on separately**
Backend:
```bash
cd .. # Back to project root
python -m nsflow.run --dev
```

Frontend:
On another terminal window
```bash
cd frontend
yarn dev
```

By default:
- **backend** will be available at: `http://127.0.0.1:8005`
- **frontend** will be available at: `http://127.0.0.1:5173`

**OR**

#### **Step 3: Start the prebuilt Frontend served with Backend**
Note: 
- Ensure that `./nsflow/prebuilt_frontend/dist` dir exists in your project
- run `sh build_scripts/build_frontend.sh` to create the above dist if it is not present

```bash
cd .. # Back to project root
python -m nsflow.run
```

- **frontend** will be available at: `http://127.0.0.1:4173`
- **backend** will be available at: `http://127.0.0.1:4173/docs`
- 
---
