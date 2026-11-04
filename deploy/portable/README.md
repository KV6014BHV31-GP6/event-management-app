# NU Docker 接續包，2026-11-04

Task: NU-DOCKER-CONTINUATION-20261104。只包裝既有已驗證的CI成品，不改React/Backend產品碼，不重建前端，不重跑被拒的Seed或Native probes。本輪Grok VM離線；Windows Desktop沒有使用。此分支是PR58之上的獨立Draft，不能作G5／合併／部署證明。

## 固定成品，不重做

- Source: `0e8bba3863267223ede48ddca35f8bb2017a5e3a`
- Existing CI run: `41650218052`, release artifact: `13238266648`
- Outer artifact SHA256: `d4563bfa176033b840202560f8ba1db2c40481a6615630d4f4c7eb6aabcec0a8`
- Inner product ZIP SHA256: `b973111057b3e0ba5dff9b3c5d039072a9365c74b8843f90f65434cad613c563`
- 所有232個payload檔案已核對hash。沿用原frontend-dist與Backend；Dockerfile沒有npm build。

完整Chat交付包包含原artifact、已解開的release及測試回條。僅從GitHub取得本目錄時，將原artifact ZIP存放在`vendor/nu-ci-artifact.zip`，或傳入`--artifact`路徑；既有GH CLI授權可下載同一run的release artifact，不需要新跑CI。

```sh
python prepare.py --artifact /path/to/NU_existing_CI_release_0e8b.zip
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/gateway.test.mjs
```

`prepare.py`核對並保留已有release，任何來源／額外檔案／hash變更均停止，沒有覆寫模式。

## Docker設計

- App容器內為FastAPI + Node gateway，保留未改動的原`createDevServer()`之Host、Origin及API控制；並封鎖source docs。
- App UID10001、readonly root filesystem、cap_drop ALL；secret不進入image。
- PostgreSQL17.11為另一個內部容器，沒有發布DB port；`nu_app`不是superuser。
- 主機僅發布`127.0.0.1:5271`，避免與現有VM5261衝突。預設不是公開網站。
- Named volumes分開保存PGdata、public uploads、private uploads。Compose啟動沒有Seed或Migration。
- 影像tag固定為Python3.14.8、Node24.14.0、PostgreSQL17.11；registry digest解析、image pull/build和container runtime尚未驗證。

## 僅全新獨立DB的可選操作

以下尚未在Grok VM執行，不能用於取代現有DB。`init-empty-schema`只接受完全空白的指定新DB，不建立帳戶或活動。

```sh
python prepare.py --new-secrets
docker compose config --quiet
docker compose build
docker compose up -d db
docker compose run --rm --no-deps app init-empty-schema --ack-new-synthetic-db nu_container_demo
docker compose up -d app
docker compose ps
```

秘密使用檔案式Compose secrets，主機目錄必須私密；POSIX `.secrets`目錄700、檔案444以允許容器UID讀取掛載檔。Windows需另外配置目錄ACL，不能把chmod當完整ACL。不是KMS或磁碟加密。

## 接續舊VM：不要重新Seed

既有VM根目錄`/workspace/nu-rose-pulse-demo-20261104`及5261/5262/8061/55441不修改。連線恢復後先跑`inspect_vm.py`，只讀hostname、Git及port，保留歷史回條與實時狀態的區分。

切換Docker前須另行核對一致性logical DB dump、公開／私人附件備份及restore，不掛載舊PGdata作新cluster。保留原Owner ID、帳戶hash、JWT與namespace。舊瀏覽器IndexedDB屬於原scheme/host/port/profile，換成5271看到空Queue並不代表舊5261沒有待同步資料。先處理或明確保留舊Queue，再按已確認的port owner切換。舊服務／DB保持可回退，不停止Grok Bots。

禁止刪除舊DB、重新Clone、重新跑bootstrap或在未知狀態下重送舊寫入。Docker不能作為重播先前被平台拒絕操作的途徑。

## 本輪實測

- 原artifact及232檔案完整性PASS。
- 新Python包裝測試30/30 PASS；新Node gateway只讀stub測試15/15 PASS。
- 最初Compose tmpfs被YAML拆成四項的RED已修正，原失敗回條保留。
- 測試主機為本Chat雲端：Python3.13.5、Node22.16.0；不是Grok VM或Docker的實測。
- Docker Engine/Compose config parser/build/run、VM資料切換、40AC/G5、Merge/CD及正式全功能影片維持NOT_RUN／原有BLOCKED。

JEV實際選擇保留舊成品、補新增包裝及有界驗證的方案B；不是合併批准或成功概率。

參考：https://docs.docker.com/compose/how-tos/startup-order/ ，https://docs.docker.com/compose/how-tos/use-secrets/ ，https://docs.docker.com/engine/network/port-publishing/ 。
