import os


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURES_PATH = os.path.join(ROOT_DIR, '../../../fixtures')

CURR_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURR_DIR)
FIXTURES_PATH = os.path.join(ROOT_DIR, "fixtures")
OPENAPI_SPECS = os.path.join(FIXTURES_PATH, "openapi.json")
TEST_NETWORK = os.path.join(FIXTURES_PATH, "test_network.hocon")


class AnyClass:
    def all_logs(self):
        print("CURR_DIR: ", CURR_DIR)
        print("ROOT_DIR: ", ROOT_DIR)
        print("FIXTURES_PATH: ", FIXTURES_PATH)
        print("OPENAPI_SPECS: ", OPENAPI_SPECS)
        print("TEST_NETWORK: ", TEST_NETWORK)

if __name__ == "__main__":
    myclass = AnyClass()
    myclass.all_logs()