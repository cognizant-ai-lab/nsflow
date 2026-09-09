# Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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
"""
Tests for resolving a request to a file at the root of the frontend build.

Only /assets is mounted, so anything Vite copies from public/ into the dist root —
the favicon among them — reaches the SPA fallback. Answering those with index.html
means the browser asks for an SVG and is handed HTML, which is why no tab icon
appeared. Equally, a client-side route must still fall through to the SPA.
"""

import os

# pylint: disable=protected-access
# _dist_file is deliberately module-private: it is an implementation detail of the
# SPA fallback, not something other modules should call. Its behaviour still needs
# pinning, since getting it wrong either hides the favicon or serves files from
# outside the build.
from nsflow.backend import main


def test_serves_a_file_that_exists_at_the_build_root(tmp_path, monkeypatch):
    """The favicon is the case this exists for."""
    (tmp_path / "nsflow.svg").write_text("<svg/>", encoding="utf-8")
    monkeypatch.setattr(main, "frontend_dist_path", str(tmp_path))

    assert main._dist_file("nsflow.svg") == os.path.realpath(str(tmp_path / "nsflow.svg"))


def test_leaves_spa_routes_and_index_to_the_fallback(tmp_path, monkeypatch):
    """
    A client-side route is not a file, and index.html is the fallback's own job.
    Serving either from here would break navigation.
    """
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.setattr(main, "frontend_dist_path", str(tmp_path))

    assert main._dist_file("editor") is None
    assert main._dist_file("index.html") is None
    assert main._dist_file("") is None


def test_refuses_to_escape_the_build_directory(tmp_path, monkeypatch):
    """
    The path comes from the URL, so an existing file outside the build must not be
    reachable by walking up out of it.
    """
    secret = tmp_path / "secret.txt"
    secret.write_text("no", encoding="utf-8")
    dist = tmp_path / "dist"
    dist.mkdir()
    monkeypatch.setattr(main, "frontend_dist_path", str(dist))

    assert main._dist_file("../secret.txt") is None
