import os
import schemathesis
from hypothesis import strategies as st
from nsflow.backend.main import app


ROOT_DIR = os.getcwd()
FIXTURES_PATH = os.path.join(ROOT_DIR, "tests", "fixtures")
OPENAPI_SPECS = os.path.join(FIXTURES_PATH, "openapi.json")
TEST_NETWORK = os.path.join(FIXTURES_PATH, "test_network.hocon")

schema = schemathesis.from_path(OPENAPI_SPECS, app=app)

print("Schema Loaded:", schema)

@schema.parametrize()
def test_api(case):
    # skip websocket endpoints
    if "/ws/" in str(case.operation):
        return
    if case.path_parameters is not None:
        # this is seemingly not working, need to investigate more
        case.path_parameters["network_name"] = st.sampled_from(["test_network"])

    response = case.call()

    if response.status_code == 404:
        assert "not found" in response.json()["detail"].lower()
    else:
        case.validate_response(response)
