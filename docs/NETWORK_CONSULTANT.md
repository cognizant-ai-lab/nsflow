# Setting up Network Consultant

Network Consultant can generate, run and improve Neuro SAN Studio test fixtures from nsflow. Its jobs require a
Neuro SAN Studio installation that provides the following command:

```bash
python -m neuro_san_studio consultant
```

Install a compatible Neuro SAN Studio version before using the feature.

Network Consultant is enabled by default. To hide the tab and disable its API routes, set the feature flag before
starting nsflow:

```bash
export NSFLOW_PLUGIN_NETWORK_CONSULTANT=false
```

By default, Network Consultant reads registries and test fixtures from nsflow's current working directory. To work
on a separate Studio checkout, set its absolute path explicitly:

```bash
export NSFLOW_NETWORK_CONSULTANT_REPO=/path/to/neuro-san-studio
```

The configured directory must contain the target network under `registries/` and its fixtures under
`tests/fixtures/`. Job logs and progress sidecars are written beneath `logs/network_consultant_jobs/` in that same
directory.
