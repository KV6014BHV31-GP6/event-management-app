import { locale, tr } from './i18n/index.js';
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,width=54){return String(text||'').split(/\r?\n/).flatMap(paragraph=>{const result=[];let line='';for(const word of paragraph.split(/\s+/)){if(line.length+word.length+1>width&&line){result.push(line);line='';}for(let i=0;i<word.length;i+=width){const part=word.slice(i,i+width);if(i){result.push(line);line='';}line+=(line?' ':'')+part;}}result.push(line);return result;});}
export function flyerSchedule({ start_time, end_time, timezone }) {
  const format = new Intl.DateTimeFormat(locale(), {
    dateStyle: 'long', timeStyle: 'short', timeZone: timezone,
  });
  const start = format.format(new Date(start_time));
  const end = end_time ? format.format(new Date(end_time)) : null;
  return (end ? start + ' – ' + end : start) + ' (' + timezone + ')';
}

export function approvedFlyerSvg(promotion) {
  if (promotion.state !== 'approved' || promotion.paused || !promotion.approved_text)
    throw new Error('Only active approved promotion content can be downloaded.');
  const flyer = promotion.flyer_data;
  const content = [
    ...lines(flyer.title, 36).map(text => ({text, size: 32, bold: true})),
    ...lines(flyerSchedule(flyer)).map(text => ({text, size: 19})),
    ...lines(flyer.location).map(text => ({text, size: 19})),
    {text: '', size: 16},
    ...lines(promotion.approved_text).map(text => ({text, size: 22})),
  ];
  let y = 140;
  const rendered = content.map(row => {
    y += row.size + 14;
    return '<text x="48" y="' + y + '" font-size="' + row.size + '"' +
      (row.bold ? ' font-weight="700"' : '') + '>' + xml(row.text) + '</text>';
  }).join('');
  const link = lines(promotion.public_url, 64).map(text => {
    y += 28;
    return '<text x="48" y="' + y + '" font-size="17">' + xml(text) + '</text>';
  }).join('');
  const height = Math.max(800, y + 90);
  // Only an HTTP(S) link supplied by the scoped workspace can be clickable.
  const url = new URL(promotion.public_url);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The event link is unavailable.');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="' + height +
    '" viewBox="0 0 800 ' + height + '" role="img" aria-label="' + xml(flyer.title) +
    '"><rect width="800" height="' + height + '" fill="#f7f5ef"/>' +
    '<rect width="800" height="110" fill="#123f35"/>' +
    '<text x="48" y="52" fill="#dfbf85" font-family="Arial,sans-serif" font-size="26" font-weight="700">ROSE · PULSE</text>' +
    '<text x="48" y="85" fill="#fff" font-family="Arial,sans-serif" font-size="16">' +
    xml(tr('Community event flyer')) + '</text><g fill="#22352f" font-family="Arial,Helvetica,sans-serif">' +
    rendered + '<a href="' + xml(url.href) + '">' + link + '</a></g></svg>';
}

export function downloadApprovedFlyer(promotion) {
  const svg = approvedFlyerSvg(promotion);
  const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'rose-approved-event-flyer.svg';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
