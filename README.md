# ROSE-Pulse | Developer review baseline

KV6014 Challenge 5，Group 6。目標 repo：`KV6014BHV31-GP6/event-management-app`。

這份 PR candidate 整理 Benjamin 的 Developer 文件、兩份 Log Task、API 交接及原有 Mock 畫面證據。**不是完成的 backend、正式 PRD、部署或團隊提交。**

## 閱讀入口

| 要做甚麼 | 文件 |
|---|---|
| 查看當前工作與阻礙 | [Dev 狀態](docs/dev/CURRENT.md) |
| 查看團隊目錄及分工邊界 | [文件目錄](docs/README.md) |
| 開始 Developer 工作 | [Dev 入口](docs/dev/README.md) |
| 核對需求及新舊 Feature ID | [需求](docs/dev/REQUIREMENTS.md)、[ID 對照](docs/dev/FEATURE_ID_CROSSWALK.md) |
| 接 backend | [API 交接](docs/api/INTEGRATION.md) |
| 取出兩份 Developer Log Task | [Log Task 入口](docs/dev/log-tasks/README.md) |
| 查看原有前端演示 | [Frontend 入口](integration/README.md) |
| 查閱來源、版本與審核規則 | [Document control](docs/dev/DOCUMENT_CONTROL.md) |

PM、UI/UX、Security、QA 及 Submission 只設分類入口，沒有代替組員完成或批准其工作。現有 NU 原件不移動、不覆寫。

## 本地文件檢查

需要 Python 3.10 或以上，這些檢查只驗證文件交付包，不驗證產品 backend。

```bash
python scripts/check_dev_control.py
python -m unittest discover -s tests -v
```

沒有在這個 PR 選定 React Native、Expo、PWA 或新 backend framework。正式實作應先檢查到時可用的 repo，再沿用既有技術和 lockfiles。
