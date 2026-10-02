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

"""Tests for the CLI arguments built by Network Consultant endpoints."""

import asyncio
import os
import unittest
from collections.abc import Callable
from collections.abc import Coroutine
from typing import Any
from unittest.mock import patch

from nsflow.backend.api.v1.network_consultant_endpoints import NetworkConsultantEndpoints
from nsflow.backend.models.network_consultant.generate_tests_request import GenerateTestsRequest
from nsflow.backend.models.network_consultant.job_start_response import JobStartResponse
from nsflow.backend.models.network_consultant.run_tests_request import RunTestsRequest


class TestNetworkConsultantRunTests(unittest.TestCase):
    """Verify run-tests and generate-tests subprocess arguments."""

    @staticmethod
    def args_for(coroutine_factory: Callable[[], Coroutine[Any, Any, JobStartResponse]]) -> dict[str, Any]:
        """Run an endpoint with job startup stubbed and return its launch data."""
        captured: dict[str, Any] = {}

        # The patch callback must be an async closure so it can capture one endpoint invocation.
        async def fake_start_job(args: list[str], agent_name: str, session_id: str) -> JobStartResponse:
            """Capture the endpoint's job-start arguments."""
            captured.update({"args": args, "agent_name": agent_name, "session_id": session_id})
            return JobStartResponse(job_id="jid", message="Job started.")

        with patch.object(NetworkConsultantEndpoints, "_start_job", fake_start_job):
            asyncio.run(coroutine_factory())
        return captured

    def test_whole_suite_runs_without_only_fixtures(self) -> None:
        """Run a complete existing fixture suite without regenerating it."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.run_tests(RunTestsRequest(network_name="industry/cpg_agents"))
        )
        args = captured.get("args", [])
        self.assertIn("--hocon-file", args)
        self.assertEqual(args[args.index("--hocon-file") + 1], "industry/cpg_agents.hocon")
        self.assertEqual(args[args.index("--max-iterations") + 1], "0")
        self.assertNotIn("--only-fixtures", args)
        self.assertNotIn("--force-generate", args)
        self.assertEqual(captured.get("agent_name"), "industry/cpg_agents")

    def test_single_fixture_is_passed_as_only_fixtures(self) -> None:
        """Pass a selected fixture to the CLI's exact-basename filter."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.run_tests(
                RunTestsRequest(network_name="industry/cpg_agents", fixture_name="gtm_strategy.hocon")
            )
        )
        args = captured.get("args", [])
        self.assertEqual(args[args.index("--only-fixtures") + 1], "gtm_strategy.hocon")

    def test_fixture_name_is_sanitized_not_trusted(self) -> None:
        """Remove every path separator before placing a fixture name in subprocess arguments."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.run_tests(
                RunTestsRequest(network_name="industry/cpg_agents", fixture_name="../../etc/passwd")
            )
        )
        args = captured.get("args", [])
        only = args[args.index("--only-fixtures") + 1]
        self.assertNotIn("/", only)
        self.assertNotIn(os.sep, only)
        self.assertEqual(only, ".._.._etc_passwd.hocon")

    def test_blank_fixture_name_means_whole_suite(self) -> None:
        """Treat whitespace-only fixture selection as a full-suite run."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.run_tests(
                RunTestsRequest(network_name="industry/cpg_agents", fixture_name="   ")
            )
        )
        self.assertNotIn("--only-fixtures", captured.get("args", []))

    def test_generation_is_forced_so_an_explicit_request_is_never_a_no_op(self) -> None:
        """Force fixture generation for an explicit generate-tests request."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.generate_tests(GenerateTestsRequest(network_name="basic/coffee"))
        )
        self.assertIn("--force-generate", captured.get("args", []))

    def test_guidance_is_forwarded_when_given(self) -> None:
        """Trim and forward nonblank generation guidance."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.generate_tests(
                GenerateTestsRequest(network_name="basic/coffee", test_guidance="  the vendor onboarding path  ")
            )
        )
        args = captured.get("args", [])
        self.assertEqual(args[args.index("--test-guidance") + 1], "the vendor onboarding path")

    def test_blank_guidance_is_omitted_entirely(self) -> None:
        """Omit the guidance flag for whitespace-only input."""
        captured = self.args_for(
            lambda: NetworkConsultantEndpoints.generate_tests(
                GenerateTestsRequest(network_name="basic/coffee", test_guidance="   ")
            )
        )
        self.assertNotIn("--test-guidance", captured.get("args", []))
