const normalized = path => String(path).replaceAll('\\', '/');

/**
 * Verifies which npm modules are actually emitted into the browser adapter.
 * This is narrow containment evidence and is NOT a waiver for npm audit.
 */
export function assertWalletBundleReachability(metafile){
 const outputs=Object.entries(metafile?.outputs||{}).filter(([path])=>
  normalized(path).endsWith('/walletconnect-bundle.js'));
 if(outputs.length!==1)throw Error('WALLET_BUNDLE_OUTPUT_UNVERIFIED');
 const emitted=Object.entries(outputs[0][1].inputs||{}).filter(([path,input])=>
  Number(input?.bytesInOutput)>0&&/(?:^|\/)node_modules\/(?:anymatch|picomatch)(?:\/|$)/.test(normalized(path))
 ).map(([path])=>path);
 if(emitted.length)throw Error('VULNERABLE_GLOB_MODULE_BUNDLED: '+emitted.join(', '));
 return {output:outputs[0][0],emitted_inputs:Object.keys(outputs[0][1].inputs||{}).length};
}
