/* Real bounded classification UI checks; no route interception or registration POST. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {chromium} = require(path.join(process.env.NU_BROWSER_TOOLS, 'node_modules/playwright'));

async function main() {
  const empty = process.argv.includes('--empty');
  const base = process.env.NU_BROWSER_URL;
  const sha = process.env.NU_BROWSER_SOURCE_SHA;
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).trim(),sha);
  const report = {schema:'nu.registration-groups-browser/1',status:'FAIL',source_sha:sha,
    helper_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    empty_database_options:empty,checks:[],registration_posts:0};
  const output = path.join(process.env.NU_CI_OUTPUT, `registration-groups-${empty?'empty':'configured'}.json`);
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [1280,390]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      try {
        const api = await context.request.get(new URL('/api/v1/registration-options',base).href);
        assert.equal(api.status(),200);
        const options = await api.json();
        assert.equal(options.age_groups.length === 0,empty);
        const events = await context.request.get(new URL('/api/v1/events',base).href);
        assert.equal(events.status(),200);
        const selected = (await events.json()).data.find(row=>row.status.toLowerCase()==='active');
        assert(selected,'Disposable synthetic event required');
        const page = await context.newPage();
        page.on('request', request=>{if(request.method()==='POST' && /registrations|applications/.test(new URL(request.url()).pathname))report.registration_posts++;});
        await page.goto(new URL(`?view=apply&event=${selected.public_id}`,base).href,{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
        for (const language of ['en','ms']) {
          if(language==='ms') {
            await page.locator('.language-button').click();
            await page.locator('button[lang=ms]').click();
          }
          const age = page.locator('select[name=age_group_code]');
          const income = page.locator('select[name=income_band_code]');
          await age.waitFor();
          assert.equal(await age.getAttribute('aria-label'),language==='en'?'Age group':'Kumpulan umur');
          assert.equal(await income.getAttribute('aria-label'),language==='en'?'Income group (optional)':'Kumpulan pendapatan (pilihan)');
          assert.equal(await age.evaluate(node=>node.required),true);
          assert.equal(await income.evaluate(node=>node.required),false);
          assert.equal(await page.locator('[name=date_of_birth]').count(),0);
          for (const [name,value] of Object.entries({first_name:'Synthetic',last_name:'Browser',phone:'TEST',national_id:'SYNTHETIC-OPTIONS-ONLY'}))
            await page.locator(`input[name=${name}]`).fill(value);
          await page.locator('input[name=gender][value=female]').check();
          await age.selectOption('');
          assert.equal(await age.evaluate(node=>node.form.checkValidity()),false);
          if(empty) {
            await page.getByText(language==='en'?'Options have not been configured.':'Pilihan belum ditetapkan.',{exact:true}).first().waitFor();
            assert.equal(await age.locator('option').count(),1);
            await page.getByRole('button',{name:language==='en'?'Submit application':'Hantar permohonan',exact:true}).click();
          } else {
            await age.locator('option').filter({hasText:options.age_groups[0].name}).waitFor({state:'attached'});
            assert.deepEqual(await age.locator('option').evaluateAll(nodes=>nodes.slice(1).map(node=>({code:node.value,name:node.textContent}))),options.age_groups);
            await age.selectOption(options.age_groups[0].code);
            await income.selectOption('');
            assert.equal(await age.evaluate(node=>node.form.checkValidity()),true);
            if(options.income_bands.length) {
              await income.selectOption(options.income_bands[0].code);
              assert.equal(await income.inputValue(),options.income_bands[0].code);
              await income.selectOption('');
            }
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
          await page.screenshot({path:path.join(process.env.NU_CI_OUTPUT,`registration-groups-${empty?'empty':'configured'}-${language}-${width}.png`)});
          report.checks.push({language,width,required_age:true,optional_income:true,no_dob:true,server_options:true,empty_blocks:empty});
        }
      } finally { await context.close(); }
    }
    assert.equal(report.registration_posts,0,'Classification inspection must not submit an application');
    report.status='PASS';
  } finally {
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
}
main().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
