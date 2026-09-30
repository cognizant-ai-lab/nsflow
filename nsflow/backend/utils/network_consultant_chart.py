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

"""Rendering for Network Consultant progress charts."""

from io import BytesIO

import matplotlib

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402

CHART_PALETTE = {
    "light": {
        "fg": "#0b0b0b",
        "grid": "#e1e0d9",
        "axis": "#c3c2b7",
        "surface": "#f5fafd",
        "red": "#d03b3b",
        "green": "#0ca30c",
        "blues": ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef"],
    },
    "dark": {
        "fg": "#ffffff",
        "grid": "#2c2c2a",
        "axis": "#383835",
        "surface": "#1e2f42",
        "red": "#d03b3b",
        "green": "#0ca30c",
        "blues": ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
    },
}


def threshold_color(passed: int, total: int, colors: dict) -> str:
    """Return the pass-threshold color for a complete test-suite checkpoint."""
    return colors["green"] if total > 0 and passed / total >= 0.8 else colors["red"]


def chart_x_labels(progress: list[dict]) -> list[str]:
    """Return compact labels with named full-suite bookends."""
    labels: list[str] = []
    for entry in progress:
        checkpoint = entry.get("checkpoint", "iteration")
        if checkpoint == "before":
            labels.append("Before")
        elif checkpoint == "after":
            labels.append("After")
        elif checkpoint == "generated":
            labels.append("Test run")
        else:
            labels.append(str(entry.get("improvement_iteration") or entry.get("check") or len(labels) + 1))
    return labels


def normalized_segments(entry: dict) -> list[int]:
    """Return stack segments that exactly sum to passed, including legacy rows."""
    passed = max(int(entry.get("passed", 0)), 0)
    if entry.get("checkpoint") != "iteration":
        return [passed]
    raw_segments = entry.get("segments")
    if not isinstance(raw_segments, list):
        return [passed]

    remaining = passed
    segments: list[int] = []
    for value in raw_segments:
        segment = min(max(int(value), 0), remaining)
        segments.append(segment)
        remaining -= segment
    if remaining:
        segments.append(remaining)
    return segments or [0]


def chart_png_bytes(progress: list[dict], theme: str = "light") -> bytes:
    """Render test progress as a transparent PNG."""
    colors = CHART_PALETTE.get(theme, CHART_PALETTE["light"])
    x_positions = list(range(1, len(progress) + 1))
    passed = [max(int(entry.get("passed", 0)), 0) for entry in progress]
    totals = [max(int(entry.get("total", 0)), 0) for entry in progress]
    max_total = max(totals, default=1) or 1
    row_segments = [normalized_segments(entry) for entry in progress]
    max_levels = max((len(segments) for segments in row_segments), default=1)

    figure, axes = plt.subplots(figsize=(max(4.5, len(progress) * 0.85), 3.2), dpi=130)
    figure.patch.set_alpha(0)
    axes.set_facecolor("none")

    for level in range(max_levels):
        heights = [segments[level] if level < len(segments) else 0 for segments in row_segments]
        bottoms = [sum(segments[:level]) for segments in row_segments]
        bar_colors = [
            _bar_color(entry, passed_count, total_count, level, colors)
            for entry, passed_count, total_count in zip(progress, passed, totals)
        ]
        axes.bar(
            x_positions,
            heights,
            bottom=bottoms,
            color=bar_colors,
            width=0.55,
            edgecolor=colors["surface"],
            linewidth=1.2,
            zorder=3,
        )

    for x_position, passed_count, total_count in zip(x_positions, passed, totals):
        percentage = round(100 * passed_count / total_count) if total_count else 0
        axes.text(
            x_position,
            passed_count + max_total * 0.03,
            f"{passed_count}/{total_count} ({percentage}%)",
            ha="center",
            va="bottom",
            color=colors["fg"],
            fontsize=9,
        )

    has_iterations = any(entry.get("checkpoint", "iteration") == "iteration" for entry in progress)
    figure.suptitle(
        "Tests Passing Per Iteration" if has_iterations else "Tests Passing",
        color=colors["fg"],
        fontsize=12,
        fontweight="bold",
    )
    _format_axes(axes, progress, x_positions, max_total, colors, has_iterations)
    figure.tight_layout(rect=(0, 0, 1, 0.92))

    buffer = BytesIO()
    figure.savefig(buffer, format="png", transparent=True)
    plt.close(figure)
    return buffer.getvalue()


def _bar_color(entry: dict, passed: int, total: int, level: int, colors: dict) -> str:
    if entry.get("checkpoint", "iteration") in {"generated", "before", "after"}:
        return threshold_color(passed, total, colors)
    blue_ramp = colors["blues"]
    return blue_ramp[min(level, len(blue_ramp) - 1)]


def _format_axes(axes, progress, x_positions, max_total, colors, has_iterations) -> None:
    axes.set_xlim(0.4, len(progress) + 0.6)
    axes.set_ylim(0, max_total * 1.2)
    axes.set_xticks(x_positions)
    axes.set_xticklabels(
        chart_x_labels(progress),
        rotation=30 if len(progress) > 6 else 0,
        ha="right" if len(progress) > 6 else "center",
    )
    axes.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=min(max_total, 8) or 1))
    axes.set_xlabel("Improvement Iterations" if has_iterations else "", color=colors["fg"], fontsize=10)
    axes.set_ylabel("Tests Passed", color=colors["fg"], fontsize=10)
    axes.tick_params(colors=colors["fg"], labelsize=9, length=0)
    axes.grid(axis="y", color=colors["grid"], linewidth=0.8, zorder=0)
    for spine in ("top", "right"):
        axes.spines[spine].set_visible(False)
    axes.spines["left"].set_color(colors["axis"])
    axes.spines["bottom"].set_color(colors["axis"])
