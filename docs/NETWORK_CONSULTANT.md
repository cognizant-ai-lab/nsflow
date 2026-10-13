# Setting up Network Consultant

Network Consultant can generate, run and improve Neuro SAN Studio test fixtures from nsflow. It is disabled by
default because its jobs require a Neuro SAN Studio installation that provides the following command:

```bash
python -m neuro_san_studio consultant
```

Install a compatible Neuro SAN Studio version before enabling the feature. Until that command is available in a
released Studio version, use the corresponding Studio development branch.

Set the feature flag before starting nsflow:

```bash
export NSFLOW_PLUGIN_NETWORK_CONSULTANT=true
```

By default, Network Consultant reads registries and test fixtures from nsflow's current working directory. To work
on a separate Studio checkout, set its absolute path explicitly:

```bash
export NSFLOW_NETWORK_CONSULTANT_REPO=/path/to/neuro-san-studio
```

The configured directory must contain the target network under `registries/` and its fixtures under
`tests/fixtures/`. Job logs and progress sidecars are written beneath `logs/network_consultant_jobs/` in that same
directory.
