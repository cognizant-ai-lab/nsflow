# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT
from leaf_common.config.file_of_class import FileOfClass

# We define some constants that point to key directories in the distribution.
ROOT_DIR = FileOfClass(__file__)
REGISTRIES_DIR = FileOfClass(__file__, path_to_basis="./registries")
