import { CompilerConfig } from '@ton/blueprint';

// Verifica una tantum: NftItem è il contratto di ogni singolo NFT mintato
// dalla collezione. Ogni item deployato (presente e futuro) usa esattamente
// questo stesso code cell — cambiano solo i dati (index, owner, content) —
// quindi una sola verifica del code hash copre automaticamente TUTTI gli
// NFT della collezione, mintati ora o in futuro. Non va ripetuta ad ogni mint.
//
// nft_item.tact importa solo messages.tact (non nft_collection.tact), quindi
// è un entry point Tact autosufficiente: compilarlo da qui produce
// esattamente lo stesso bytecode del contratto NftItem incluso nella
// compilazione di nft_collection.tact (vedi deploy-collection/tact.config.json
// e contracts/output/NftCollection_NftItem.code.boc).
export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'deploy-collection/contracts/nft_item.tact',
  options: {
    debug: false,
  },
};
