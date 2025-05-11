
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT

import LogsPanel from '../../components/LogsPanel';

export default function Observability() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Observability Dashboard</h1>
      <LogsPanel />
    </div>
  );
}
