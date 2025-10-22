# Setting up Visual Question Answering (VQA) FastAPI endpoints

1. Clone `ml-fastvlm` repository in the same folder as `nsflow`. E.g., both `nsflow` and `ml-0fastvlm` are cloned in `~/MyProjects` folder.

```bash
git clone https://github.com/kxk302/ml-fastvlm.git
```

2. Change the directory to `ml-fastvlm`

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
5. Install opencv

```bash
pip install opencv-python==4.8.0.74
```

6. Set `NSFLOW_PLUGIN_VQA_ENDPOINT` environment variable to `True` for the VQA endpoints to be added to the http service.

```bash
export NSFLOW_PLUGIN_VQA_ENDPOINT=True
```

7. Refer to [vqa_endpoints.py](../nsflow/backend/api/v1/vqa_endpoints.py) for example `curl` commands to call the endpoint.
