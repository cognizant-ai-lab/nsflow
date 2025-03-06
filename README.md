# NSFlow - A FastAPI based client for NeuroSan

NSFlow is a framework that enables users to explore, visualize, and interact with smart agent networks. It integrates **Neuro-SAN** for intelligent agent-based interactions.

![Project Logo](frontend/src/assets/snapshot01.png)

---
## **Installation & Running NSFlow**

NSFlow can be installed and run in **three different ways:**

### **1️⃣ Run with NSFlow CLI**
To simplify execution, NSFlow provides a CLI command to start both the backend and frontend simultaneously.

#### **Step 1: Clone the repository**
```bash
git clone https://github.com/leaf-ai/nsflow.git
```

#### **Step 2: Install NSFlow as a Package**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### **Step 3: Run Everything with a Single Command**
```bash
python -m nsflow run
```

By default, this will start:
- **backend** (FastAPI + Neuro-SAN) here: `http://127.0.0.1:4173/docs` or `http://127.0.0.1:4173/redoc`
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
cd frontend; yarn install
```

#### **Step 3: Start the Backend**
```bash
cd .. # Back to project root
python -m nsflow.run --dev
```

#### **Step 4: Start the Frontend**
On another terminal window
```bash
cd frontend
yarn dev
```

By default:
- **backend** will be available at: `http://127.0.0.1:8005`
- **frontend** will be available at: `http://127.0.0.1:5173`

---
