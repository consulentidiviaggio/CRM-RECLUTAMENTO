(function (root) {
  'use strict';
  function parsePrice(value) {
    const match = String(value).trim().match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
    if (!match) return null;
    const cents = +match[1] * 100 + +String(match[2] || '').padEnd(2, '0');
    return cents > 0 ? cents : null;
  }
  function due(fee, tariff) {
    if (fee?.type === 'free' || tariff === 'free') return 0;
    if (fee?.type !== 'paid' || !Number.isSafeInteger(fee.cents) || fee.cents <= 0) return null;
    return tariff === 'half' ? Math.round(fee.cents / 2) : fee.cents;
  }
  const tariffLabels = {full:'Quota intera', half:'Metà prezzo', free:'Gratuito'};
  const methodLabels = {transfer:'Bonifico', pos:'POS'};
  function record(fee, tariff, method, previous) {
    const amount = due(fee, tariff);
    if (!Object.hasOwn(tariffLabels, tariff) || (method && !Object.hasOwn(methodLabels, method))) throw Error('Opzione di pagamento non valida.');
    if (amount === null || fee?.type !== 'paid') throw Error('Imposta prima la tariffa dell’evento a pagamento.');
    if (tariff === 'free') return {tariff, method:'', paidCents:0};
    const keep = method && previous?.method === method && previous?.tariff === tariff && Number.isSafeInteger(previous.paidCents) && previous.paidCents > 0;
    return {tariff, method, paidCents:method ? (keep ? previous.paidCents : amount) : 0};
  }
  function describe(fee, payment, consultant) {
    if (!consultant && !payment) return {label:'', dueCents:null, paidCents:0, pendingCents:0};
    const paidCents = Object.hasOwn(methodLabels, payment?.method) && Number.isSafeInteger(payment.paidCents) && payment.paidCents > 0 ? payment.paidCents : 0;
    const amount = paidCents || due(fee, payment?.tariff);
    const tariff = tariffLabels[payment?.tariff] || tariffLabels.full;
    const label = paidCents ? `Pagato · ${methodLabels[payment.method]} · ${tariff}`
      : amount === null ? 'Tariffa da impostare' : amount === 0 ? 'Gratuito' : `Da pagare · ${tariff}`;
    return {label, dueCents:amount, paidCents, pendingCents:paidCents ? 0 : amount || 0};
  }
  const api = {parsePrice, record, describe};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CRM_SHIP_PAYMENTS = api;
})(globalThis);
