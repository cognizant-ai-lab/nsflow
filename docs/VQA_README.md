# Setting up Visual Question Answering (VQA) FastAPI endpoints

1. Clone `ml-fastvlm` repository (E.g., in `~/MyProjects` folder)

```bash
git clone https://github.com/kxk302/ml-fastvlm.git
```

2. Change directory to `ml-fastvlm`

```bash
cd ml-fastvlm
```

3. Using Python *3.10*, create/activate a virtual environment

```bash
python3 -m venv venv;
. ./venv/bin/activate
```

4. Install `ml-fastvlm` repo

```bash
pip install -e .
```

5. Set `FASTVLM_REPO_DIR` environment variable to the *full* path to `ml-fastvlm` repository. E.g.,

```bash
export FASTVLM_REPO_DIR="~/MyProjects/ml-fastvlm"
```

6. Refer to [vqa_endpoints.py](../nsflow/backend/api/v1/vqa_endpoints.py) for example `curl` commands to call the endpoint.
