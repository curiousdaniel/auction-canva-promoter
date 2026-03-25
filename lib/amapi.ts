const AM_DOMAIN = process.env.AM_DOMAIN!;

export async function amAuth(): Promise<string> {
  const res = await fetch(`https://${AM_DOMAIN}/amapi/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.AM_EMAIL,
      password: process.env.AM_PASSWORD,
    }),
  });
  const data = await res.json();
  if (data.status !== 'success') throw new Error(data.message);
  return data.token;
}

export async function amFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`https://${AM_DOMAIN}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res.json();
}
