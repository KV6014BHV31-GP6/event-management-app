import { MockEventService, DEMO_PEOPLE } from './mock-service.mjs';

// Explicit mock composition. The independent HTTP adapter is never auto-enabled.
let service = new MockEventService();
let role = 'participant';
let selectedPerson = 'DEMO-B';
let filter = '';
let keyCounter = 0;
let cancelTarget = null;
const key = () => `demo-operation-${++keyCounter}`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const names = {confirmed:'已確認', waiting:'候補中', cancelled:'已取消', pending:'待同步',synced:'已同步',conflict:'需處理衝突',checked_in:'已簽到',reported:'已記錄'};
const badge = status => `<span class="badge ${esc(status)}">DEMO · ${esc(names[status] || status)}</span>`;
const people = () => `<label for="person">示範身份<select id="person">${DEMO_PEOPLE.map(p => `<option${p === selectedPerson ? ' selected' : ''}>${p}</option>`).join('')}</select></label>`;
const button = (action, id, text, extra='') => `<button type="button" class="secondary ${extra}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const quota = (label,used,total) => `<div class="quota"><div><span>${label}</span><strong>${used} / ${total}</strong></div><progress aria-label="${label}" value="${used}" max="${Math.max(total,1)}"></progress></div>`;
const rows = (bookings,action) => bookings.length ? bookings.map(b => `<div class="row"><div><strong>${esc(b.person)}</strong><small>${esc(b.id)}<br>${b.channel === 'leader' ? '社區預留名額' : '公開名額'}${b.checkedIn ? ' · 已簽到' : ''}</small></div><div class="row-actions">${badge(b.status)}${action(b)}</div></div>`).join('') : '<p class="empty">暫時沒有符合的示範記錄。</p>';

function render() {
 const {event,bookings,reports,queue,summary,online} = service.snapshot().data;
 document.querySelector('#network').textContent = online ? '模擬斷網' : '恢復模擬連線';
 document.querySelector('#network').setAttribute('aria-pressed',String(!online));
 document.querySelector('#network-state').textContent = online ? '模擬連線正常' : '模擬斷網：簽到暫存記憶體，重新載入會遺失';
 document.querySelectorAll('[data-role]').forEach(el => role === el.dataset.role ? el.setAttribute('aria-current','page') : el.removeAttribute('aria-current'));
 const cancel = b => b.status !== 'cancelled' && !b.checkedIn ? button('cancel',b.id,'取消報名','danger') : '';
 let html;
 if(role === 'participant') {
  html = `<section class="card"><span class="card-label">參加者 · US07 / US01 / US08</span><h2>申請一個示範名額</h2><p>社區活動示範，只有一個時段。這不是正在接受報名的真實活動。</p><ol class="journey"><li>選身份</li><li>提交申請</li><li>看回條</li></ol><div class="event-meta"><span class="pill">09:00 至 10:00 · 示範時段</span><span class="pill">公開剩餘 ${event.publicQuota-summary.publicUsed} 位</span></div><div class="form-grid">${people()}<button type="button" class="primary" data-action="register">申請示範名額</button></div><p class="hint">不用帳戶或個人資料。公開名額滿了會進候補。不同渠道重複報名會被拒絕。</p></section><section class="card"><h3>目前示範身份的回條：${esc(selectedPerson)}</h3>${rows(bookings.filter(b=>b.person===selectedPerson),cancel)}<p class="hint">不展示其他身份的回條。這是畫面隔離，不是正式身份驗證或 guest token。</p></section>`;
 } else if(role === 'leader') {
  html = `<section class="card"><span class="card-label">社區負責人 · US06</span><h2>協助居民報名</h2><p>示範只有一位社區負責人 DEMO-LEADER。預留名額不與公開名額混用。</p>${quota('社區已用／預留',summary.leaderUsed,event.leaderQuota)}<div class="form-grid">${people()}<button type="button" class="primary" data-action="proxy">代辦示範報名</button></div>${rows(bookings.filter(b=>b.channel==='leader'),()=> '')}</section><section class="card"><span class="card-label">宣傳與線下回報 · US04 / US05</span><h3>複製文案或列印示範海報</h3><div class="promo" id="promo">示範活動，並非真實邀請\n社區活動 · 09:00 至 10:00\n示範連結：https://example.invalid/demo-event?ref=DEMO-LEADER\n此連結不能真實報名。</div><div class="actions"><button type="button" class="secondary" data-action="copy">複製文案</button><button type="button" class="secondary" data-action="print">列印本頁</button></div><div class="form-grid"><label for="count">派發傳單數量<input id="count" type="number" min="1" max="500" value="25"></label><button type="button" class="primary" data-action="report">儲存示範回報</button></div><p class="hint">派單數是自行回報，不是接觸人數、報名數或已驗證成效。不會發送 WhatsApp。</p></section>`;
 } else if(role === 'coordinator') {
  html = `<div class="stats">${[[summary.confirmed,'已確認報名'],[summary.waiting,'候補'],[summary.checkedIn,'已簽到'],[summary.reportedFlyers,'自報派單數']].map(([n,label])=>`<div class="stat"><strong>${n}</strong><span>${label} · DEMO</span></div>`).join('')}</div><section class="card"><span class="card-label">統籌者 · US01 / US03</span><h2>名額與需求分開看</h2>${quota('公開已用／配額',summary.publicUsed,event.publicQuota)}${quota('社區已用／配額',summary.leaderUsed,event.leaderQuota)}<p>活動總上限：${event.totalCapacity}。已簽到者已包含在「已確認」，不要重複扣名額。</p><div class="form-grid"><label for="public-quota">公開配額<input id="public-quota" type="number" min="0" max="4" value="${event.publicQuota}"></label><label for="leader-quota">社區配額<input id="leader-quota" type="number" min="0" max="4" value="${event.leaderQuota}"></label></div><button class="secondary" type="button" data-action="quota">套用示範配額</button><p class="hint">總和不能超過 4，不能減至少於已確認人數。修改配額不會自動補候補，該規則仍待決定。</p></section><section class="card"><h3>線下推廣回報</h3>${reports.length ? reports.map(r=>`<div class="row"><strong>${r.count} 張傳單</strong>${badge('reported')}</div>`).join('') : '<p class="empty">尚無回報，可到社區負責人頁新增。</p>'}</section>`;
 } else {
  const found = bookings.filter(b=>b.status === 'confirmed' && `${b.person} ${b.id}`.toLowerCase().includes(filter.toLowerCase()));
  html = `<section class="card"><span class="card-label">現場同事 · US09 / US10</span><h2>查找並辦理簽到</h2><label for="roster-search">搜尋示範身份或編號<input id="roster-search" type="search" value="${esc(filter)}" placeholder="例如 DEMO-B"></label>${rows(found,b=>b.checkedIn ? badge('checked_in') : button('checkin',b.id,online ? '簽到' : '暫存簽到'))}<p class="hint">手動查找示範名單，未接 QR scanner。不做跨裝置同步。</p></section><section class="card"><h3>同步佇列</h3>${queue.length ? queue.map(q=>`<div class="row"><div><strong>${esc(q.id)}</strong><small>嘗試 ${q.attempts} 次${q.lastError ? `<br>${esc(q.lastError)}` : ''}</small></div><div class="row-actions">${badge(q.status)}${q.status === 'pending' ? button('change',q.id,'模擬上游取消','danger') : ''}</div></div>`).join('') : '<p class="empty">模擬斷網後簽到，記錄會顯示為待同步。</p>'}<div class="actions"><button type="button" class="primary" data-action="retry">重試同步</button><button type="button" class="secondary" data-action="retry-fail">模擬一次同步失敗</button></div><p class="hint">這是記憶體模擬。重新載入會重設，沒有真實離線持久化。衝突需處理，不自動覆蓋。</p></section><section class="card"><h3>Walk-in 現場即到</h3><p>配額與 no-show 釋放政策尚未批准，不能確認新名額。</p><button class="secondary" type="button" data-action="walkin">檢查是否可接收 Walk-in</button><p class="hint">可驗證系統會阻擋未確認規則，不會靜默新增報名。</p></section>`;
 }
 document.querySelector('#view').innerHTML = html;
}
function feedback(message,isError=false) {
 const el=document.querySelector('#feedback');el.textContent=`DEMO：${message}`;el.classList.toggle('error',isError);
}
function fail(error) {
 const map={duplicate:'這個示範身份已有有效報名，請選擇其他身份。',offline:'目前模擬斷網。請恢復連線後提交。',policy_pending:'Walk-in 政策待確認，沒有建立名額。',conflict:'資料或名額已有衝突，未套用這次變更。',validation:'輸入不符合示範規則，請檢查數值。'};
 feedback(map[error.kind] || error.message || '操作失敗，沒有切換到其他資料來源。',true);
}
document.addEventListener('change',event=>{
 if(event.target.id==='person'){selectedPerson=event.target.value;render();document.querySelector('#person')?.focus();}
});
document.addEventListener('input',event=>{
 if(event.target.id==='roster-search') {filter=event.target.value;render();document.querySelector('#roster-search')?.focus();}
});
document.addEventListener('click',async event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.dataset.role){role=target.dataset.role;render();return;}
 if(target.id==='network'){service.online=!service.online;feedback(service.online?'已恢復模擬連線。請手動重試待同步項目。':'模擬斷網。簽到只暫存記憶體。');render();return;}
 if(target.id==='reset-demo'){service=new MockEventService();keyCounter=0;selectedPerson='DEMO-B';cancelTarget=null;filter='';feedback('全部示範資料已重設。');render();return;}
 if(target.id==='confirm-no'){cancelTarget=null;document.querySelector('#confirm-dialog').close();return;}
 try {
  if(target.id==='confirm-yes') {
   const id=cancelTarget;cancelTarget=null;document.querySelector('#confirm-dialog').close();
   service.cancel(id);feedback('已取消示範報名。候補按同渠道順序補位。');render();return;
  }
  const action=target.dataset.action;
  if(action==='cancel'||action==='change'){cancelTarget=target.dataset.id;document.querySelector('#confirm-dialog').showModal();return;}
  if(action==='register'||action==='proxy') {
   const result=service.register({person:selectedPerson,channel:action==='proxy'?'leader':'public',key:key()});
   feedback(`${result.data.person}：${names[result.data.status]}。沒有建立真實預約。`);
  } else if(action==='report') {service.report({count:Number(document.querySelector('#count').value),key:key()});feedback('已加入示範派單回報。');
  } else if(action==='quota') {service.setQuotas({publicQuota:Number(document.querySelector('#public-quota').value),leaderQuota:Number(document.querySelector('#leader-quota').value)});feedback('已更新示範配額。');
  } else if(action==='checkin') {const r=service.checkIn(target.dataset.id,key());feedback(`簽到狀態：${names[r.data.status]||r.data.status}`);
  } else if(action==='retry'||action==='retry-fail') {service.retry({failFirst:action==='retry-fail'});feedback('重試完成，請檢查待同步與衝突。');
  } else if(action==='walkin') {service.walkIn();
  } else if(action==='copy') {try {await navigator.clipboard.writeText(document.querySelector('#promo').textContent);feedback('文案已複製，沒有發送訊息。');} catch {feedback('瀏覽器未允許複製。請直接選取上方文案複製。',true);}return;
  } else if(action==='print') {window.print();return;
  } else return;
  render();
 } catch(error){fail(error);}
});
render();
