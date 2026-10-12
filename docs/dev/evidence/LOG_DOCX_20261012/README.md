# Frozen source-capture evidence | 12 October 2026

這組檔案保留原有 capture 和 Word QA 的 bytes。包含 source HTML、六張 full-page screenshot、crop provenance、成功記錄、首次 selector mismatch 失敗記錄與原 runner。

`NU_v1.2.1_Browser_Capture_Evidence.json` 的12項結果來自原有 sandboxed Chromium `about:blank + set_content`，使用 in-memory Mock、沒有 storage fixture，也没有 live backend/實際 offline sync。這和較早 TASK-005 的78個 injected DOM checks 是不同 run，不能相加或混稱本輪重測。

本次重新核對source、screenshots及兩份Word的SHA256，另外重 render Word；没有重新執行這個歷史 runner。

`run_source.py` 保留原環境 absolute paths，僅作 provenance，不是目前 repo 的 portable command。重新執行要以獨立新 task/run 另存結果，不覆寫本組證據，也不得關閉 browser sandbox 或繞過 navigation policy。

較早 v1.2.1 verification/coverage 的摘要在 [historical summary](../V121_HISTORICAL_SUMMARY.md)。完整原始工程 ZIP 沒有包含在此 PR。
