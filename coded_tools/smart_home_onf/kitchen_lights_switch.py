
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
from coded_tools.smart_home_onf.lights_switch import LightsSwitch


class KitchenLightsSwitch(LightsSwitch):
    """
    CodedTool implementation that calls an API to turn lights on or off.
    """

    def __init__(self):
        """
        Constructs a switch for kitchen lights.
        """
        super().__init__("Kitchen")
