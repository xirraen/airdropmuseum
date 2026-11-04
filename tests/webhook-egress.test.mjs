import test from 'node:test';
import assert from 'node:assert/strict';
import {targetUrl} from '../src/publicApi/webhookService.ts';
const origin='https://museum.example.org';
test('webhook egress fails closed without explicit operator approval',()=>{
 assert.throws(()=>targetUrl('https://partner.example.org/hook',origin),/DESTINATION_NOT_ALLOWED/);
 const env={PARTNER_WEBHOOK_ALLOWED_HOSTS:'partner.example.org'};
 assert.equal(targetUrl('https://partner.example.org/hook',origin,env),'https://partner.example.org/hook');
 for(const url of ['http://partner.example.org','https://127.0.0.1','https://[::1]','https://2130706433','https://169.254.169.254','https://localhost','https://partner.example.org.evil.org','https://partner.example.org.','https://user:pass@partner.example.org','https://partner.example.org:8443'])assert.throws(()=>targetUrl(url,origin,env));
 assert.throws(()=>targetUrl(origin,origin,{PARTNER_WEBHOOK_ALLOWED_HOSTS:'museum.example.org'}),/SELF_TARGET/);
});
