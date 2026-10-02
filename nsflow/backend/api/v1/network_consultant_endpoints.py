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

"""HTTP routes for Network Consultant operations."""

import logging
import os

from fastapi import APIRouter
from fastapi import HTTPException

from nsflow.backend.models.network_consultant.answer_job_request import AnswerJobRequest
from nsflow.backend.models.network_consultant.fixture_delete_response import FixtureDeleteResponse
from nsflow.backend.models.network_consultant.fixture_save_request import FixtureSaveRequest
from nsflow.backend.models.network_consultant.fixture_save_response import FixtureSaveResponse
from nsflow.backend.models.network_consultant.fixtures_response import FixturesResponse
from nsflow.backend.models.network_consultant.generate_tests_request import GenerateTestsRequest
from nsflow.backend.models.network_consultant.improve_network_request import ImproveNetworkRequest
from nsflow.backend.models.network_consultant.job_answer_response import JobAnswerResponse
from nsflow.backend.models.network_consultant.job_start_response import JobStartResponse
from nsflow.backend.models.network_consultant.job_status_response import JobStatusResponse
from nsflow.backend.models.network_consultant.job_stop_response import JobStopResponse
from nsflow.backend.models.network_consultant.run_tests_request import RunTestsRequest
from nsflow.backend.models.network_consultant.sly_data_keys_response import SlyDataKeysResponse
from nsflow.backend.utils.consultant_job_manager import ConsultantJobManager
from nsflow.backend.utils.fixture_not_found_error import FixtureNotFoundError
from nsflow.backend.utils.fixture_repository import FixtureRepository
from nsflow.backend.utils.invalid_network_name_error import InvalidNetworkNameError
from nsflow.backend.utils.job_not_found_error import JobNotFoundError
from nsflow.backend.utils.job_state_error import JobStateError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/network_consultant")
consultant_repo_path = os.getenv("NSFLOW_NETWORK_CONSULTANT_REPO", os.getcwd())
fixture_repository = FixtureRepository(consultant_repo_path)
job_manager = ConsultantJobManager(consultant_repo_path)


class NetworkConsultantEndpoints:
    """Expose fixture editing and consultant-job lifecycle operations."""

    DEFAULT_DIRECTION = "Fix any currently failing tests without changing the network's intended behavior."

    @staticmethod
    @router.get("/fixtures", response_model=FixturesResponse)
    async def list_fixtures(network_name: str) -> FixturesResponse:
        """List the test fixtures stored for a network."""
        try:
            fixtures = fixture_repository.list(network_name)
        except InvalidNetworkNameError as error:
            raise HTTPException(status_code=400, detail="Invalid network_name.") from error
        return FixturesResponse(network_name=network_name, fixtures=fixtures)

    @staticmethod
    @router.get("/sly_data_keys", response_model=SlyDataKeysResponse)
    async def list_sly_data_keys(network_name: str) -> SlyDataKeysResponse:
        """Return literal sly_data keys referenced by a network's coded tools."""
        try:
            keys = fixture_repository.sly_data_keys(network_name)
        except InvalidNetworkNameError as error:
            raise HTTPException(status_code=400, detail="Invalid network_name.") from error
        return SlyDataKeysResponse(network_name=network_name, keys=keys)

    @staticmethod
    @router.put("/fixtures", response_model=FixtureSaveResponse)
    async def save_fixture(
        network_name: str,
        fixture_name: str,
        request: FixtureSaveRequest,
        original_fixture_name: str | None = None,
    ) -> FixtureSaveResponse:
        """Create or atomically replace a fixture."""
        try:
            safe_name = fixture_repository.save(
                network_name,
                fixture_name,
                request.fixture,
                original_fixture_name,
            )
        except InvalidNetworkNameError as error:
            raise HTTPException(status_code=400, detail="Invalid network_name.") from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"errors": error.args[0]}) from error
        except OSError as error:
            raise HTTPException(status_code=500, detail=f"Could not write fixture: {error}") from error
        return FixtureSaveResponse(message=f"Saved {safe_name}.")

    @staticmethod
    @router.delete("/fixtures", response_model=FixtureDeleteResponse)
    async def delete_fixture(network_name: str, fixture_name: str) -> FixtureDeleteResponse:
        """Delete one fixture from a network."""
        try:
            safe_name = fixture_repository.delete(network_name, fixture_name)
        except InvalidNetworkNameError as error:
            raise HTTPException(status_code=400, detail="Invalid network_name.") from error
        except FixtureNotFoundError as error:
            raise HTTPException(status_code=404, detail=f"Fixture '{error.args[0]}' not found.") from error
        return FixtureDeleteResponse(message=f"Deleted {safe_name}.")

    @staticmethod
    async def _start_job(args: list[str], agent_name: str, session_id: str) -> JobStartResponse:
        """Start a consultant job and translate process startup failures to HTTP errors."""
        try:
            job_id = await job_manager.start(args, agent_name, session_id)
        except OSError as error:
            logger.error("Failed to start network_consultant job: %s", error)
            raise HTTPException(status_code=500, detail=f"Failed to start job: {error}") from error
        return JobStartResponse(job_id=job_id, message="Job started.")

    @staticmethod
    @router.post("/generate-tests", response_model=JobStartResponse)
    async def generate_tests(request: GenerateTestsRequest) -> JobStartResponse:
        """Generate fixtures, run them once, and stop before the improvement loop."""
        return await NetworkConsultantEndpoints._start_job(
            [
                "--hocon-file",
                FixtureRepository.network_hocon_file(request.network_name),
                "--direction",
                "Generate tests only -- no fix loop requested.",
                "--test-level",
                request.test_level,
                *(["--test-guidance", request.test_guidance.strip()] if request.test_guidance.strip() else []),
                "--force-generate",
                "--max-iterations",
                "0",
            ],
            agent_name=request.network_name,
            session_id=request.session_id,
        )

    @staticmethod
    @router.post("/run-tests", response_model=JobStartResponse)
    async def run_tests(request: RunTestsRequest) -> JobStartResponse:
        """Run all existing fixtures, or one named fixture, without improving the network."""
        fixture_name = (request.fixture_name or "").strip()
        return await NetworkConsultantEndpoints._start_job(
            [
                "--hocon-file",
                FixtureRepository.network_hocon_file(request.network_name),
                "--direction",
                NetworkConsultantEndpoints.DEFAULT_DIRECTION,
                *(["--only-fixtures", FixtureRepository.safe_fixture_file_name(fixture_name)] if fixture_name else []),
                "--max-iterations",
                "0",
            ],
            agent_name=request.network_name,
            session_id=request.session_id,
        )

    @staticmethod
    @router.post("/improve", response_model=JobStartResponse)
    async def improve_network(request: ImproveNetworkRequest) -> JobStartResponse:
        """Run the complete generate, test, diagnose, and repair loop."""
        return await NetworkConsultantEndpoints._start_job(
            [
                "--hocon-file",
                FixtureRepository.network_hocon_file(request.network_name),
                "--direction",
                request.direction.strip() or NetworkConsultantEndpoints.DEFAULT_DIRECTION,
                "--test-level",
                request.test_level,
                "--max-iterations",
                str(request.max_iterations),
                "--success-ratio",
                request.success_ratio,
                *(["--git-versions"] if request.git_versions else []),
            ],
            agent_name=request.network_name,
            session_id=request.session_id,
        )

    @staticmethod
    @router.get("/jobs/{job_id}", response_model=JobStatusResponse)
    async def get_job_status(job_id: str, theme: str = "light") -> JobStatusResponse:
        """Return current process state and output for a job."""
        try:
            return await job_manager.status(job_id, theme)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.") from error

    @staticmethod
    @router.post("/jobs/{job_id}/answer", response_model=JobAnswerResponse)
    async def answer_job(job_id: str, request: AnswerJobRequest) -> JobAnswerResponse:
        """Submit an answer to a job waiting for clarification."""
        try:
            job_manager.answer(job_id, request.answer)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.") from error
        except JobStateError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return JobAnswerResponse(job_id=job_id, message="Answer submitted.")

    @staticmethod
    @router.post("/jobs/{job_id}/stop", response_model=JobStopResponse)
    async def stop_job(job_id: str) -> JobStopResponse:
        """Stop a running job."""
        try:
            stopped = await job_manager.stop(job_id)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.") from error
        message = "Job stopped." if stopped else "Job had already finished."
        return JobStopResponse(job_id=job_id, stopped=stopped, message=message)
