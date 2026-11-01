# Physical hotspot and phone PWA script

Status: **PHYSICAL_IPHONE_NOT_RUN**. An agent-controlled browser offline flag and stopping owned local services are separate engineering evidence. Neither proves a real iPhone hotspot or iPhone PWA.

Prerequisites: use synthetic data only; a test device connected through the iPhone Personal Hotspot; an actually separate reachable HTTPS server/Backend; a valid secure origin and current fixed version pair. Do not expose an old Demo database or open firewall/admin permissions implicitly. The shipped loopback5205 demo is only local: disabling the PC's hotspot connection does **not** make127.0.0.1 unreachable. Running server and client on that same PC is not a valid hotspot-loss proof.

1. Record iPhone/test-device model, OS/browser, cellular carrier/network type, server origin, FE/BE SHA, contract/migration and UTC time. Do not record phone/account IDs or tokens.
2. With actual API reachable, sign in as the synthetic leader, select/download one eligible event, confirm public AppShell installed and storage status. Capture only redacted queue counts/references.
3. Disable Cellular Data or disconnect the hotspot. Record whether the Wi-Fi hotspot itself disappears; do not infer loss solely from the Settings toggle.
4. From the test device make a fresh, uncached API probe and record failure/time. If the API still works, mark NETWORK_ISOLATION_NOT_ESTABLISHED and do not call the following steps a disconnected test.
5. Open the prepared form and save exactly three distinct synthetic drafts. Verify local readback and state; do not mark them synced/approved.
6. Reload, close/reopen the app, then separately restart the physical device if authorized and scheduled. Record each level separately; verify the same three stable submission IDs and same immutable batch data remain. A lost queue is FAIL, not a reason to silently recreate it.
7. Restore connection, establish actual API reachability, and reauthenticate the same current leader if needed. Check the exact actor and current role before manual Sync.
8. Sync once. Record each durable outcome/registration reference; compare authorized receipt GET and a fresh READ ONLY DB connection. Synced receipt is independent of pending/approved/waiting state.
9. Invoke reconciliation/retry with the same stable IDs; verify no extra registration or participant and unchanged immutable receipt. Never press repeatedly after an unknown outcome or generate replacement IDs blindly.
10. Explicitly remove synthetic local test data after reconciliation; record deletion and server retention separately. Preserve all failed steps and limitations.

Use separate cases for (A) another device using the iPhone hotspot and (B) the iPhone itself running the installed PWA. For caseB use HTTPS, not http://LAN-IP; document Safari/storage/add-to-home-screen behavior independently. Storage persistence requests are not guarantees against eviction or device loss. Actual airplane/cellular/hotspot operations and physical restarts require a human operator here. No production Offline Ready badge follows from these scripts alone.
