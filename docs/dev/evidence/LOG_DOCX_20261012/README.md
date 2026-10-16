# Frozen source-capture evidence | 12 October 2026

This set preserves original capture and Word QA bytes: source HTML, six full-page screenshots, crop provenance, successful records, the first selector-mismatch failure and original runner.

The twelve results in `NU_v1.2.1_Browser_Capture_Evidence.json` came from the original sandbox-enabled Chromium `about:blank + set_content` run, using an in-memory Mock without a storage fixture, live backend or actual offline sync. It is a separate run from the earlier TASK-005 seventy-eight injected DOM checks. Do not add them together or describe them as tests rerun in this revision.

The historical documentation intake rechecked source, screenshot and both Word SHA256 values, and separately rerendered Word. It did not rerun this historical runner. The 2026-10-16 Markdown translation does not rerun capture or Word rendering.

`run_source.py` retains original-environment absolute paths for provenance; it is not a portable command for this repository. Any rerun needs a separate task/run with new outputs. Do not overwrite this evidence, disable the browser sandbox or bypass navigation policy.

The earlier v1.2.1 verification/coverage summary is [here](../V121_HISTORICAL_SUMMARY.md). The complete original engineering ZIP is not included in this documentation PR.
