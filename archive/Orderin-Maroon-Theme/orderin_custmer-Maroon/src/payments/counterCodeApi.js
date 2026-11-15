const FUNCTIONS_BASE = 'https://us-central1-orderin-7f8bc.cloudfunctions.net';

async function postCounter(name, body) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'Counter payment could not be confirmed');
    error.data = data;
    throw error;
  }
  return data;
}

export function issueCounterCode(payload) {
  return postCounter('issueCounterCode', payload);
}

export function confirmCounterPayment(payload) {
  return postCounter('confirmCounterPayment', payload);
}
