const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);

// Existing estimate links already contain these lines. Render their saved scope;
// never turn the included services into independently selectable quote options.
export function quoteItems(quote,option){
 const source=Array.isArray(option.lineItems)?option.lineItems:quote.recordType==='estimate'&&quote.options.length===1?quote.lineItems:[];
 return (Array.isArray(source)?source:[]).filter(l=>typeof l.description==='string'&&Number.isFinite(l.quantity)&&l.quantity>=0&&Number.isFinite(l.unitPrice)&&l.unitPrice>=0).map(l=>({...l,total:round(l.quantity*l.unitPrice)}));
}
export function quoteTitle(quote,option){const lines=quoteItems(quote,option);return lines.length>1?`${lines.length} selected services`:option.description;}
export function quoteBreakdown(quote,option){
 const lines=quoteItems(quote,option);if(!lines.length)return `<span class="price">${money(option.price)}</span><small>Full quoted total</small>`;
 const subtotal=round(lines.reduce((sum,l)=>sum+l.total,0)),difference=round(option.price-subtotal),taxLabel=quote.taxRate>0?`Tax (${quote.taxRate}% on applicable items)`:'Adjustment';
 return `<div class="quote-breakdown"><ul class="service-breakdown" aria-label="Included services">${lines.map(l=>`<li><div><strong>${esc(l.description)}</strong><small>Qty ${esc(l.quantity)} × ${money(l.unitPrice)}</small>${l.details?`<p class="service-details">${esc(l.details)}</p>`:''}</div><span class="line-total">${money(l.total)}</span></li>`).join('')}</ul><dl class="quote-totals"><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>${difference!==0||quote.taxRate>0?`<div><dt>${esc(taxLabel)}</dt><dd>${money(difference)}</dd></div>`:''}<div class="grand-total"><dt>Total for all included services</dt><dd>${money(option.price)}</dd></div></dl></div>`;
}
