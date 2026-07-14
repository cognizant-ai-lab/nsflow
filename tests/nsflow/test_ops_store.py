# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
import os
import shutil
import tempfile
import unittest

from nsflow.backend.utils.editor import ops_store
from nsflow.backend.utils.editor.ops_store import OperationStore


class _FakeManager:  # pylint: disable=too-few-public-methods  # minimal test stand-in
    """Minimal SimpleStateManager stand-in: OperationStore only needs get_state()."""

    def get_state(self):
        """Return a fixed minimal state dict for the store to snapshot."""
        return {"network_name": "net", "agents": {}}


class TestOperationStore(unittest.TestCase):
    def setUp(self):
        """Redirect the draft-state root to a temp dir so tests never touch the package."""
        self.tmp_dir = tempfile.mkdtemp()
        self._orig_root = ops_store.ROOT_DIR
        ops_store.ROOT_DIR = self.tmp_dir

    def tearDown(self):
        ops_store.ROOT_DIR = self._orig_root
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_undo_on_empty_history_returns_false(self):
        """Regression: undo() reads history via _read_jsonl before the empty check,
        so a naming mismatch there raised AttributeError instead of returning False."""
        store = OperationStore("design-1", _FakeManager())
        self.assertFalse(store.undo())

    def test_read_jsonl_round_trip(self):
        """_read_jsonl returns [] for a missing file and reads back appended rows."""
        path = os.path.join(self.tmp_dir, "history.jsonl")
        # pylint: disable=protected-access  # exercising OperationStore's private jsonl helpers directly
        self.assertEqual(OperationStore._read_jsonl(path), [])

        OperationStore._append_jsonl(path, {"a": 1})
        OperationStore._append_jsonl(path, {"b": 2})
        self.assertEqual(OperationStore._read_jsonl(path), [{"a": 1}, {"b": 2}])
        # pylint: enable=protected-access


if __name__ == "__main__":
    unittest.main()
