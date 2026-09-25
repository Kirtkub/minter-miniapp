import { CompilerConfig } from '@ton/blueprint';

// Non usato per il deploy (che resta interamente client-side in
// deploy-collection/web/src/app.ts, tramite TonConnect): questo file serve
// solo a "npx blueprint verify", che deve poter ricompilare il sorgente Tact
// da zero per calcolare l'hash del code cell e confrontarlo con quello del
// contratto già deployato on-chain.
//
// Deve produrre esattamente lo stesso bytecode dei .boc committati in
// deploy-collection/contracts/output/, quindi va tenuto sincronizzato con
// deploy-collection/tact.config.json (stessa versione del compilatore Tact,
// vedi devDependency "@tact-lang/compiler" in package.json, e stesse
// opzioni: debug=false).
export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'deploy-collection/contracts/nft_collection.tact',
  options: {
    debug: false,
  },
};
