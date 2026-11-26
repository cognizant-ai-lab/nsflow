# Network Consultant

Network Consultant adds a **Self-Improvement** tab to nsflow. Use it to create test fixtures, run tests, and improve
an agent network from its test failures.

## Use Self-Improvement

Open an agent network outside editor mode and select the **Self-Improvement** tab.

1. Select **View** to inspect the network's fixtures. The fixture editor can create, edit, rename, duplicate, delete,
   and run individual fixtures.
2. Select a test level and choose **Generate** to create and run fixtures. Optional guidance can specify the behavior
   the generated tests should cover.
3. Choose **Run all** to run the existing fixtures without changing the network.
4. Set the maximum iterations and required success ratio, then choose **Improve**. Optional direction can describe
   the behavior to preserve or change.
5. Review the test results, progress chart, clarification questions, and reported tool issues. Choose **Stop** to
   terminate the active job.

> **Important:** Improve edits the selected network HOCON file in place. Commit or back up the file before starting
> an improvement run.

Only one job can run for a network at a time. If the browser is refreshed while a job is running, the tab reconnects
to that job while the same nsflow process remains active. Completed runs are not restored after a refresh.

## Use the command line

Run all existing fixtures without changing the network. Setting `--max-iterations 0` disables repairs:

```bash
ns consultant \
    --hocon-file basic/coffee_finder.hocon \
    --max-iterations 0
```

Run one existing fixture:

```bash
ns consultant \
    --hocon-file basic/coffee_finder.hocon \
    --only-fixtures example.hocon \
    --max-iterations 0
```

Generate fixtures and run them once:

```bash
ns consultant \
    --hocon-file basic/coffee_finder.hocon \
    --force-generate \
    --max-iterations 0
```

Run tests and improve the network:

```bash
ns consultant \
    --hocon-file basic/coffee_finder.hocon \
    --max-iterations 10 \
    --success-ratio 3/3
```

The HOCON path is relative to `registries/`. Run `ns consultant --help` for all options.

## Test fixtures

Fixtures are HOCON files under `tests/fixtures/<network>/`. A fixture identifies the agent, defines a success ratio,
and contains one or more interactions with response checks. See the Neuro SAN
[fixture schema](https://github.com/cognizant-ai-lab/neuro-san/blob/main/docs/test_case_hocon_reference.md) for the
complete format.

The fixture editor manages interaction text, timeouts, `sly_data`, and text response checks. It preserves supported
fields that are not shown in the editor, including structure checks, conversation controls, comments, and license
headers.
