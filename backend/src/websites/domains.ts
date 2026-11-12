import { domainToASCII } from 'node:url';
import { resolveCname, resolveTxt } from 'node:dns/promises';
export const reservedSubdomains = new Set([
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'support',
  'platform',
  'cdn',
  'assets',
  'school',
  'schools',
  'localhost',
  'preview',
]);
export function normalizeHostname(value: string) {
  if (/[\s/\\:@?#]/.test(value))
    throw new Error('Enter a hostname without a protocol, port or path');
  const host = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ''));
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))
    throw new Error('Enter a hostname such as www.yourschool.edu.bd, without a protocol or path');
  return host;
}
export async function verifyDomainRecords(
  hostname: string,
  token: string,
  target: string,
  dns = { resolveTxt, resolveCname },
) {
  const [txt, cname] = await Promise.all([
    dns.resolveTxt(`_campusone.${hostname}`),
    dns.resolveCname(hostname),
  ]);
  return (
    txt.some((record) => record.join('') === `campusone-verification=${token}`) &&
    cname.some(
      (record) =>
        record.toLowerCase().replace(/\.$/, '') === target.toLowerCase().replace(/\.$/, ''),
    )
  );
}
