# Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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

"""The CLI a run-tests / generate-tests request turns into."""

import asyncio
import os
import unittest
from unittest.mock import patch

from nsflow.backend.api.v1 import network_consultant_endpoints as endpoints
from nsflow.backend.models.network_consultant_models import GenerateTestsRequest
from nsflow.backend.models.network_consultant_models import JobStartResponse
from nsflow.backend.models.network_consultant_models import RunTestsRequest


def _args_for(coroutine_factory):
    """Run an endpoint with _start_job stubbed, and return the argv it would have launched."""
    captured = {}

    async def fake_start_job(args, agent_name, session_id):
        captured["args"] = args
        captured["agent_name"] = agent_name
        captured["session_id"] = session_id
        return JobStartResponse(job_id="jid", message="Job started.")

    with patch.object(endpoints, "_start_job", fake_start_job):
        asyncio.run(coroutine_factory())
    return captured


class TestRunTestsArgs(unittest.TestCase):
    """POST /run-tests"""

    def test_whole_suite_runs_without_only_fixtures(self):
        captured = _args_for(lambda: endpoints.run_tests(RunTestsRequest(network_name="industry/cpg_agents")))
        args = captured["args"]
        self.assertIn("--hocon-file", args)
        self.assertEqual(args[args.index("--hocon-file") + 1], "industry/cpg_agents.hocon")
        self.assertEqual(args[args.index("--max-iterations") + 1], "0")
        self.assertNotIn("--only-fixtures", args)
        # Running a suite must never regenerate it.
        self.assertNotIn("--force-generate", args)
        self.assertEqual(captured["agent_name"], "industry/cpg_agents")

    def test_single_fixture_is_passed_as_only_fixtures(self):
        captured = _args_for(
            lambda: endpoints.run_tests(
                RunTestsRequest(network_name="industry/cpg_agents", fixture_name="gtm_strategy.hocon")
            )
        )
        args = captured["args"]
        self.assertEqual(args[args.index("--only-fixtures") + 1], "gtm_strategy.hocon")

    def test_fixture_name_is_sanitized_not_trusted(self):
        """It reaches a subprocess argv, so no path separator may survive. Traversal is
        additionally impossible downstream -- run_all_tests uses only_fixtures as an exact
        membership filter over basenames it globbed itself -- but the separator is stripped
        here so nothing depends on that alone."""
        captured = _args_for(
            lambda: endpoints.run_tests(
                RunTestsRequest(network_name="industry/cpg_agents", fixture_name="../../etc/passwd")
            )
        )
        only = captured["args"][captured["args"].index("--only-fixtures") + 1]
        self.assertNotIn("/", only)
        self.assertNotIn(os.sep, only)
        self.assertEqual(only, ".._.._etc_passwd.hocon")

    def test_blank_fixture_name_means_whole_suite(self):
        captured = _args_for(
            lambda: endpoints.run_tests(RunTestsRequest(network_name="industry/cpg_agents", fixture_name="   "))
        )
        self.assertNotIn("--only-fixtures", captured["args"])


class TestGenerateTestsArgs(unittest.TestCase):
    """POST /generate-tests"""

    def test_generation_is_forced_so_an_explicit_request_is_never_a_no_op(self):
        captured = _args_for(lambda: endpoints.generate_tests(GenerateTestsRequest(network_name="basic/coffee")))
        self.assertIn("--force-generate", captured["args"])

    def test_guidance_is_forwarded_when_given(self):
        captured = _args_for(
            lambda: endpoints.generate_tests(
                GenerateTestsRequest(network_name="basic/coffee", test_guidance="  the vendor onboarding path  ")
            )
        )
        args = captured["args"]
        self.assertEqual(args[args.index("--test-guidance") + 1], "the vendor onboarding path")

    def test_blank_guidance_is_omitted_entirely(self):
        captured = _args_for(
            lambda: endpoints.generate_tests(GenerateTestsRequest(network_name="basic/coffee", test_guidance="   "))
        )
        self.assertNotIn("--test-guidance", captured["args"])


if __name__ == "__main__":
    unittest.main()
