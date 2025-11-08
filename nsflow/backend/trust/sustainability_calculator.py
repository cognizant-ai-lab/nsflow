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

import logging
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class SustainabilityMetrics:
    """Data class for sustainability metrics"""

    energy_kwh: float
    carbon_g_co2: float
    water_liters: float
    model_name: str
    calculation_method: str
    energy_context: str = ""  # Comparative context (e.g., "equivalent to 2 minutes of laptop use")


class SustainabilityCalculator:
    """
    EXPERIMENTAL: Scientific calculator for LLM sustainability metrics based on research data.

    WARNING: This is an experimental implementation for demonstration purposes.
    The sustainability calculations are approximations based on available research data
    and should not be considered production-ready or scientifically precise.

    Uses estimated energy consumption data from sustainability research spreadsheets.
    Actual energy consumption may vary significantly based on hardware, infrastructure,
    model optimization, and deployment configurations.

    For production use, integrate with actual hardware monitoring and validated
    sustainability measurement frameworks.
    """

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

        # Research-based energy consumption data (from spreadsheet)
        self.model_energy_profiles = {
            # GPT-4o baseline configuration
            "gpt-4": {
                "energy_per_query_wh": 0.301,  # Wh per typical query (500 tokens output)
                "energy_per_10k_tokens_wh": 2.4,  # Wh for 10k token input
                "energy_per_100k_tokens_wh": 40,  # Wh for 100k token input
                "active_parameters_b": 100,  # 100B active parameters
                "typical_output_tokens": 500,  # Average output tokens
                "gpu_utilization": 0.1,  # 10% GPU utilization
                "datacenter_pue": 1.2,  # Power Usage Effectiveness
                "power_adjustment": 0.7,  # Partial utilization adjustment
            },
            # GPT-4o with long output
            "gpt-4-long": {
                "energy_per_query_wh": 0.902,
                "energy_per_10k_tokens_wh": 7.2,  # Scaled proportionally
                "energy_per_100k_tokens_wh": 120,
                "active_parameters_b": 100,
                "typical_output_tokens": 1500,  # Long output scenario
                "gpu_utilization": 0.1,
                "datacenter_pue": 1.2,
                "power_adjustment": 0.7,
            },
            # Smaller model (e.g., GPT-4o-mini)
            "gpt-3.5-turbo": {
                "energy_per_query_wh": 0.06,  # Much more efficient
                "energy_per_10k_tokens_wh": 0.48,  # Scaled proportionally
                "energy_per_100k_tokens_wh": 8,
                "active_parameters_b": 20,  # 20B parameters
                "typical_output_tokens": 500,
                "gpu_utilization": 0.1,
                "datacenter_pue": 1.2,
                "power_adjustment": 0.7,
            },
            # Pessimistic scenario (larger model + worse utilization)
            "gpt-4-pessimistic": {
                "energy_per_query_wh": 1.304,
                "energy_per_10k_tokens_wh": 10.4,
                "energy_per_100k_tokens_wh": 173,
                "active_parameters_b": 200,  # 200B parameters
                "typical_output_tokens": 500,
                "gpu_utilization": 0.05,  # Worse utilization
                "datacenter_pue": 1.3,  # Higher PUE
                "power_adjustment": 0.7,
            },
            # Pessimistic + long outputs
            "gpt-4-pessimistic-long": {
                "energy_per_query_wh": 3.911,
                "energy_per_10k_tokens_wh": 31.3,
                "energy_per_100k_tokens_wh": 521,
                "active_parameters_b": 200,
                "typical_output_tokens": 1500,  # Long output
                "gpu_utilization": 0.05,
                "datacenter_pue": 1.3,
                "power_adjustment": 0.7,
            },
            # Local Ollama models (estimated based on CPU inference)
            "llama2-7b": {
                "energy_per_query_wh": 0.15,  # Estimated for local CPU
                "energy_per_10k_tokens_wh": 1.2,
                "energy_per_100k_tokens_wh": 20,
                "active_parameters_b": 7,
                "typical_output_tokens": 500,
                "gpu_utilization": 0.0,  # CPU-based
                "datacenter_pue": 1.0,  # No datacenter
                "power_adjustment": 1.0,  # Direct local consumption
            },
            "llama2-13b": {
                "energy_per_query_wh": 0.25,
                "energy_per_10k_tokens_wh": 2.0,
                "energy_per_100k_tokens_wh": 33,
                "active_parameters_b": 13,
                "typical_output_tokens": 500,
                "gpu_utilization": 0.0,
                "datacenter_pue": 1.0,
                "power_adjustment": 1.0,
            },
        }

        # Energy context comparisons (from research data)
        self.energy_comparisons = {
            0.3: "typical ChatGPT query",
            0.75: "10W LED bulb for 5 minutes",
            1.0: "laptop use for 5 minutes",
            8.33: "microwave for 30 seconds",
            19.44: "US household consumption per minute",
            80: "toasting bread for 3 minutes",
            250: "driving electric car for 1 mile",
            1166.67: "US household consumption per hour",
        }

        # Carbon intensity factors (g CO₂/kWh)
        self.carbon_intensity = {
            "us_grid": 386,  # US average grid
            "renewable": 50,  # Renewable energy estimate
            "datacenter": 250,  # Typical datacenter with some renewables
        }

        # Water usage factors (L/kWh) for datacenter cooling
        self.water_intensity = {"datacenter": 1.8, "local": 0.1}  # Cloud datacenter  # Local computation

    def calculate_from_token_accounting(self, token_data: Dict[str, Any]) -> SustainabilityMetrics:
        """
        Calculate sustainability metrics from NeuroSan token accounting data using research-based values.

        Args:
            token_data: Dictionary containing:
                - total_tokens: Total number of tokens processed
                - prompt_tokens: Number of prompt tokens
                - completion_tokens: Number of completion tokens
                - time_taken_in_seconds: Time taken for the request
                - model: Model name (if available)

        Returns:
            SustainabilityMetrics object with calculated values
        """
        try:
            # Extract data with defaults
            total_tokens = token_data.get("total_tokens", 0)
            _prompt_tokens = token_data.get("prompt_tokens", 0)
            _completion_tokens = token_data.get("completion_tokens", 0)
            _time_taken = token_data.get("time_taken_in_seconds", 0)
            model_name = token_data.get("model", "unknown")

            # Turning off logging here for the terminal logs to reduce noise
            # self.logger.info(f"SustainabilityCalculator input: total_tokens={total_tokens}, model={model_name}")

            # Get model profile
            model_profile = self._get_model_profile(model_name)
            # self.logger.info(f"Selected model profile: {model_profile}")

            # Calculate energy consumption using research-based method
            energy_wh = self._calculate_energy_from_tokens_research(total_tokens, model_profile)
            energy_kwh = energy_wh / 1000.0  # Convert Wh to kWh

            # self.logger.info(f"Calculated energy: {energy_wh} Wh = {energy_kwh} kWh")

            # Calculate carbon footprint
            carbon_g = self._calculate_carbon_footprint(energy_kwh, model_name)

            # Calculate water usage
            water_l = self._calculate_water_usage(energy_kwh, model_name)

            # self.logger.info(f"Final metrics: energy={energy_kwh} kWh, carbon={carbon_g} g, water={water_l} L")

            # Generate energy context
            energy_context = self._get_energy_context(energy_wh)

            return SustainabilityMetrics(
                energy_kwh=energy_kwh,
                carbon_g_co2=carbon_g,
                water_liters=water_l,
                model_name=model_name,
                calculation_method="research_based_token_calculation",
                energy_context=energy_context,
            )

        except Exception as e:
            self.logger.error(f"Error calculating sustainability metrics: {e}")
            # Return minimal default metrics on error
            return SustainabilityMetrics(
                energy_kwh=0.0003,  # 0.3 Wh typical query
                carbon_g_co2=0.075,  # Estimated carbon
                water_liters=0.0005,  # Estimated water
                model_name=model_name,
                calculation_method="fallback_default",
                energy_context="typical ChatGPT query",
            )

    def _get_model_profile(self, model_name: str) -> Dict[str, Any]:
        """Get energy profile for a specific model based on research data."""
        model_key = self._normalize_model_name(model_name)
        return self.model_energy_profiles.get(model_key, self.model_energy_profiles["gpt-3.5-turbo"])

    def _normalize_model_name(self, model_name: str) -> str:
        """Normalize model name to match research profiles."""
        if not model_name or model_name == "unknown":
            normalized = "llama2-7b"  # Default to local model for unknown
        else:
            model_lower = model_name.lower()

            # OpenAI models
            if "gpt-4" in model_lower:
                if "turbo" in model_lower or "preview" in model_lower:
                    normalized = "gpt-4"  # Standard GPT-4
                else:
                    normalized = "gpt-4-pessimistic"  # Assume larger/slower variant
            elif "gpt-3.5" in model_lower or "gpt3.5" in model_lower:
                normalized = "gpt-3.5-turbo"

            # Local models
            elif "llama2" in model_lower or "llama-2" in model_lower:
                if "13b" in model_lower:
                    normalized = "llama2-13b"
                else:
                    normalized = "llama2-7b"  # Default to 7B
            elif "llama" in model_lower:
                normalized = "llama2-7b"  # Generic llama
            elif "mistral" in model_lower or "mixtral" in model_lower:
                normalized = "llama2-7b"  # Similar efficiency to Llama2-7B
            elif "ollama" in model_lower:
                normalized = "llama2-7b"  # Default ollama model

            # Default fallback
            else:
                normalized = "llama2-7b"  # Default to local model

        # self.logger.info(f"Model name '{model_name}' normalized to '{normalized}'")
        return normalized

    def _calculate_energy_from_tokens_research(self, total_tokens: int, model_profile: Dict[str, Any]) -> float:
        """
        Calculate energy consumption using research-based token scaling.

        Based on research data:
        - Typical query (500 tokens): 0.3 Wh
        - 10k token input: 2.4 Wh
        - 100k token input: 40 Wh
        """
        if total_tokens == 0:
            return model_profile["energy_per_query_wh"] * 0.1  # Minimal energy for empty query

        # Use research-based scaling
        if total_tokens <= 1000:
            # Linear scaling for small queries
            return model_profile["energy_per_query_wh"] * (total_tokens / 500.0)
        elif total_tokens <= 10000:
            # Scale between typical query and 10k tokens
            base_energy = model_profile["energy_per_query_wh"]
            energy_10k = model_profile["energy_per_10k_tokens_wh"]
            ratio = (total_tokens - 500) / (10000 - 500)
            return base_energy + (energy_10k - base_energy) * ratio
        elif total_tokens <= 100000:
            # Scale between 10k and 100k tokens
            energy_10k = model_profile["energy_per_10k_tokens_wh"]
            energy_100k = model_profile["energy_per_100k_tokens_wh"]
            ratio = (total_tokens - 10000) / (100000 - 10000)
            return energy_10k + (energy_100k - energy_10k) * ratio
        else:
            # Extrapolate beyond 100k tokens
            energy_100k = model_profile["energy_per_100k_tokens_wh"]
            return energy_100k * (total_tokens / 100000.0)

    def _calculate_carbon_footprint(self, energy_kwh: float, model_name: str) -> float:
        """Calculate carbon footprint from energy consumption."""
        if "gpt" in model_name.lower():
            # OpenAI datacenter with some renewable energy
            carbon_intensity = self.carbon_intensity["datacenter"]
        else:
            # Local computation using grid average
            carbon_intensity = self.carbon_intensity["us_grid"]

        return energy_kwh * carbon_intensity

    def _calculate_water_usage(self, energy_kwh: float, model_name: str) -> float:
        """Calculate water usage from energy consumption."""
        if "gpt" in model_name.lower():
            # Cloud datacenter water usage
            water_intensity = self.water_intensity["datacenter"]
        else:
            # Local computation (minimal cooling)
            water_intensity = self.water_intensity["local"]

        return energy_kwh * water_intensity

    def _get_energy_context(self, energy_wh: float) -> str:
        """Get comparative energy context for the calculated energy consumption."""
        # Find closest comparison
        closest_value = min(self.energy_comparisons.keys(), key=lambda x: abs(x - energy_wh))
        closest_context = self.energy_comparisons[closest_value]

        if energy_wh < 0.1:
            return f"less than {closest_context}"
        elif abs(energy_wh - closest_value) < closest_value * 0.2:
            return f"equivalent to {closest_context}"
        elif energy_wh > closest_value:
            ratio = energy_wh / closest_value
            if ratio < 2:
                return f"{ratio:.1f}x {closest_context}"
            else:
                return f"{ratio:.0f}x {closest_context}"
        else:
            ratio = closest_value / energy_wh
            return f"1/{ratio:.1f} of {closest_context}"

    def get_model_info(self, model_name: str) -> Dict[str, Any]:
        """Get detailed model information for display."""
        profile = self._get_model_profile(model_name)
        normalized_name = self._normalize_model_name(model_name)

        return {
            "normalized_name": normalized_name,
            "active_parameters": f"{profile['active_parameters_b']}B",
            "typical_output_tokens": profile["typical_output_tokens"],
            "energy_per_query": f"{profile['energy_per_query_wh']:.3f} Wh",
            "gpu_utilization": f"{profile['gpu_utilization']*100:.0f}%",
            "datacenter_pue": profile["datacenter_pue"],
        }
