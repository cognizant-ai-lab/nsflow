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
from typing import Any
from typing import ClassVar

from matplotlib.axes import Axes
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.ticker import MaxNLocator


class NetworkConsultantChart:
    """Render Network Consultant test progress as a transparent PNG."""

    PALETTE: ClassVar[dict[str, dict[str, str | list[str]]]] = {
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

    @classmethod
    def threshold_color(cls, passed: int, total: int, colors: dict[str, str | list[str]]) -> str:
        """Return the pass-threshold color for a complete test-suite checkpoint."""
        color_name = "green" if total > 0 and passed / total >= 0.8 else "red"
        return cls._color(colors, color_name)

    @staticmethod
    def x_labels(progress: list[dict[str, Any]]) -> list[str]:
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

    @staticmethod
    def normalized_segments(entry: dict[str, Any]) -> list[int]:
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

    @classmethod
    def png_bytes(cls, progress: list[dict[str, Any]], theme: str = "light") -> bytes:
        """Render test progress as a transparent PNG."""
        colors = cls.PALETTE.get(theme, cls.PALETTE.get("light", {}))
        figure = Figure(figsize=(max(4.5, len(progress) * 0.85), 3.2), dpi=130)
        FigureCanvasAgg(figure)
        axes = figure.add_subplot()
        figure.patch.set_alpha(0)
        axes.set_facecolor("none")
        cls._draw_bars(axes, progress, colors)
        cls._draw_value_labels(axes, progress, colors)
        cls._set_title(figure, progress, colors)
        cls._format_axes(axes, progress, colors)
        figure.tight_layout(rect=(0, 0, 1, 0.92))

        buffer = BytesIO()
        figure.savefig(buffer, format="png", transparent=True)
        return buffer.getvalue()

    @classmethod
    def _bar_color(
        cls,
        entry: dict[str, Any],
        level: int,
        colors: dict[str, str | list[str]],
    ) -> str:
        """Return a checkpoint threshold color or iteration stack color."""
        if entry.get("checkpoint", "iteration") in {"generated", "before", "after"}:
            passed = max(int(entry.get("passed", 0)), 0)
            total = max(int(entry.get("total", 0)), 0)
            return cls.threshold_color(passed, total, colors)
        blue_ramp = colors.get("blues", [])
        if not isinstance(blue_ramp, list) or not blue_ramp:
            return "#104281"
        return blue_ramp[min(level, len(blue_ramp) - 1)]

    @classmethod
    def _format_axes(
        cls,
        axes: Axes,
        progress: list[dict[str, Any]],
        colors: dict[str, str | list[str]],
    ) -> None:
        """Apply labels, scales, colors, and grid formatting to chart axes."""
        x_positions = list(range(1, len(progress) + 1))
        max_total = max((max(int(entry.get("total", 0)), 0) for entry in progress), default=1) or 1
        has_iterations = any(entry.get("checkpoint", "iteration") == "iteration" for entry in progress)
        axes.set_xlim(0.4, len(progress) + 0.6)
        axes.set_ylim(0, max_total * 1.2)
        axes.set_xticks(x_positions)
        axes.set_xticklabels(
            cls.x_labels(progress),
            rotation=30 if len(progress) > 6 else 0,
            ha="right" if len(progress) > 6 else "center",
        )
        axes.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=min(max_total, 8) or 1))
        axes.set_xlabel(
            "Improvement Iterations" if has_iterations else "", color=cls._color(colors, "fg"), fontsize=10
        )
        axes.set_ylabel("Tests Passed", color=cls._color(colors, "fg"), fontsize=10)
        axes.tick_params(colors=cls._color(colors, "fg"), labelsize=9, length=0)
        axes.grid(axis="y", color=cls._color(colors, "grid"), linewidth=0.8, zorder=0)
        for name in ("top", "right"):
            spine = axes.spines.get(name)
            if spine is not None:
                spine.set_visible(False)
        for name in ("left", "bottom"):
            spine = axes.spines.get(name)
            if spine is not None:
                spine.set_color(cls._color(colors, "axis"))

    @classmethod
    def _draw_bars(
        cls,
        axes: Axes,
        progress: list[dict[str, Any]],
        colors: dict[str, str | list[str]],
    ) -> None:
        """Draw full-suite or stacked iteration bars."""
        row_segments = [cls.normalized_segments(entry) for entry in progress]
        max_levels = max((len(segments) for segments in row_segments), default=1)
        for level in range(max_levels):
            heights = [segments[level] if level < len(segments) else 0 for segments in row_segments]
            bottoms = [sum(segments[:level]) for segments in row_segments]
            bar_colors = [cls._bar_color(entry, level, colors) for entry in progress]
            axes.bar(
                list(range(1, len(progress) + 1)),
                heights,
                bottom=bottoms,
                color=bar_colors,
                width=0.55,
                edgecolor=cls._color(colors, "surface"),
                linewidth=1.2,
                zorder=3,
            )

    @classmethod
    def _draw_value_labels(
        cls,
        axes: Axes,
        progress: list[dict[str, Any]],
        colors: dict[str, str | list[str]],
    ) -> None:
        """Draw the passed count, total, and percentage above each bar."""
        max_total = max((max(int(entry.get("total", 0)), 0) for entry in progress), default=1) or 1
        for x_position, entry in enumerate(progress, start=1):
            passed = max(int(entry.get("passed", 0)), 0)
            total = max(int(entry.get("total", 0)), 0)
            percentage = round(100 * passed / total) if total else 0
            axes.text(
                x_position,
                passed + max_total * 0.03,
                f"{passed}/{total} ({percentage}%)",
                ha="center",
                va="bottom",
                color=cls._color(colors, "fg"),
                fontsize=9,
            )

    @classmethod
    def _set_title(
        cls,
        figure: Figure,
        progress: list[dict[str, Any]],
        colors: dict[str, str | list[str]],
    ) -> None:
        """Set a title that distinguishes iterative and one-shot test runs."""
        has_iterations = any(entry.get("checkpoint", "iteration") == "iteration" for entry in progress)
        figure.suptitle(
            "Tests Passing Per Iteration" if has_iterations else "Tests Passing",
            color=cls._color(colors, "fg"),
            fontsize=12,
            fontweight="bold",
        )

    @staticmethod
    def _color(colors: dict[str, str | list[str]], name: str) -> str:
        """Return one scalar palette color."""
        color = colors.get(name, "")
        return color if isinstance(color, str) else ""
