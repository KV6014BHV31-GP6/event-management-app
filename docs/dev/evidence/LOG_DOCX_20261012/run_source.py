from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, traceback, os
ROOT=Path('/mnt/data/nu_final_capture')
SRC=Path('/mnt/data/nu_assets/ROSE_DEMO_English_v1.2.1_SOURCE.html')
report={'source':str(SRC),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'source_method':'Files text materialization of original standalone HTML; no UI/source rewriting','started_utc':datetime.now(timezone.utc).isoformat(),'method':'Chromium sandbox enabled; about:blank + page.set_content; no storage fixture','checks':[],'captures':[],'network_requests':[],'page_errors':[],'backend_tested':False,'real_offline_sync_tested':False}
def check(name,fn):
 fn();report['checks'].append({'name':name,'status':'PASS'});print('PASS',name,flush=True)
def assertion(v,msg='assertion failed'):
 if not v: raise AssertionError(msg)
def capture(page,name):
 page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(ROOT/(name+'.png')),full_page=True,timeout=5000)
 targets=page.locator('#view > *').evaluate_all('(els)=>els.map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,cls:el.className,x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})')
 report['captures'].append({'name':name+'.png','sha256':hashlib.sha256((ROOT/(name+'.png')).read_bytes()).hexdigest(),'viewport':page.viewport_size,'regions':targets})
 print('CAPTURE',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,chromium_sandbox=True,timeout=16000,args=['--disable-dev-shm-usage','--disable-background-networking'])
  report['browser_version']=browser.version
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1)
  context.route('**/*',lambda route: (report['network_requests'].append(route.request.url),route.abort()))
  page=context.new_page();page.set_default_timeout(3000)
  page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
  page.set_content(SRC.read_text(),wait_until='domcontentloaded',timeout=7000)
  check('01 source UI loads with synthetic demo banner',lambda:expect(page.locator('.mock-banner')).to_contain_text('DEMO ONLY'))
  def roles():
   for role in ['leader','coordinator','field','participant']:
    page.locator(f'[data-role="{role}"]').click();expect(page.locator(f'[data-role="{role}"]')).to_have_attribute('aria-current','page')
  check('02 four existing role views switch',roles)
  page.locator('[data-action="register"]').click()
  check('03 DEMO-B has confirmed local receipt',lambda:expect(page.locator('.receipt-card .badge')).to_have_text('Confirmed'))
  capture(page,'participant_mobile_confirmed_390px')
  page.locator('#person').select_option('DEMO-C');page.locator('[data-action="register"]').click()
  check('04 public quota full yields waitlisted DEMO-C',lambda:expect(page.locator('.receipt-card .badge')).to_have_text('Waitlisted'))
  capture(page,'participant_mobile_waitlist_390px')
  page.set_viewport_size({'width':1440,'height':1050})
  page.locator('[data-role="leader"]').click();page.locator('#person').select_option('DEMO-D');page.locator('[data-action="proxy"]').click()
  check('05 leader-assisted reserved-pool registration',lambda:expect(page.locator('#feedback')).to_contain_text('DEMO-D: Confirmed'))
  page.locator('#count').fill('25');page.locator('[data-action="report"]').click()
  check('06 outreach self-report saved in demo',lambda:expect(page.locator('#feedback')).to_contain_text('25 flyers'))
  capture(page,'leader_desktop_proxy_outreach_1440px')
  page.locator('[data-role="coordinator"]').click()
  check('07 dashboard reflects shared demo counts',lambda:assertion(page.locator('.stat strong').all_text_contents()==['3','1','0','25']))
  capture(page,'coordinator_desktop_dashboard_1440px')
  page.locator('#public-quota').fill('4');page.locator('[data-action="quota"]').click()
  check('08 excessive quota rejected visibly',lambda:expect(page.locator('#feedback')).to_have_attribute('role','alert'))
  page.locator('[data-role="field"]').click();page.locator('#demo-controls > summary').click();page.locator('#network').click();page.locator('#field-search').fill('DEMO-A');page.locator('[data-action="checkin"]').click()
  check('09 simulated offline check-in stays pending',lambda:expect(page.locator('.badge.pending')).to_have_text('Pending sync'))
  capture(page,'field_desktop_pending_1440px')
  page.locator('#network').click();page.locator('[data-action="retry"]').click()
  check('10 manual DEMO sync changes pending to synced',lambda:expect(page.locator('.badge.synced')).to_have_text('Synced in demo'))
  capture(page,'field_desktop_synced_1440px')
  page.locator('[data-role="participant"]').click();page.locator('#person').select_option('DEMO-B');page.locator('[data-action="cancel"]').click();page.locator('[data-action="confirm"]').click();page.locator('#person').select_option('DEMO-C')
  check('11 cancellation promotes same-pool waitlist in demo',lambda:expect(page.locator('.receipt-card .badge')).to_have_text('Confirmed'))
  page.locator('[data-role="field"]').click();page.locator('[data-action="walkin"]').click()
  check('12 unapproved walk-in allocation remains blocked',lambda:expect(page.locator('#feedback')).to_contain_text('No place was confirmed or deducted'))
  report['page_url']=page.url
  report['storage_state']=page.locator('#storage-state').inner_text()
  report['status']='PASS' if not report['page_errors'] else 'PAGE_ERRORS'
  context.close();browser.close()
except Exception as e:
 report['status']='FAILED';report['error']=str(e);report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
finally:
 report['ended_utc']=datetime.now(timezone.utc).isoformat()
 (ROOT/'NU_v1.2.1_Browser_Capture_Evidence.json').write_text(json.dumps(report,indent=2))
 print('FINAL',report['status'],'checks',len(report['checks']),flush=True)
