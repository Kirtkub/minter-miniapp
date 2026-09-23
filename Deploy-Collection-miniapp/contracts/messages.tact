// Shared message and struct definitions for the NFT collection + item contracts.

// Sent by a trusted off-chain signer (holder of AUTHENTICATION_SIGNATURE_PRIVATE_KEY)
// to authorize minting one NFT copy. The collection contract only accepts this if
// `signature` is a valid Ed25519 signature (over sha256 of the other fields) made
// with the public key stored on-chain at deploy time.
message(0x6d696e74) Mint {
    queryId: Int as uint64;
    // Index into metadataIndex.json identifying which NFT "design" is being minted.
    // Several mints can share the same metadataIndex, producing multiple copies of
    // the same artwork/metadata, up to whatever limit the off-chain signer enforces.
    metadataIndex: Int as uint32;
    // Off-chain URL (TEP-64 style) with the metadata json for this specific NFT copy.
    contentUrl: String;
    newOwner: Address;
    validUntil: Int as uint32;
    signature: Slice;
}

// Sent once, by the collection contract only, right after an NftItem child is deployed,
// to set its real owner and content (the child's address only depends on its index and
// the collection address, not on owner/content, so this must happen post-deploy).
message(0x696e6974) Initialize {
    owner: Address;
    content: Cell;
}

// TEP-62 standard transfer.
message(0x5fcc3d14) Transfer {
    queryId: Int as uint64;
    newOwner: Address;
    responseDestination: Address;
    customPayload: Cell? = null;
    forwardAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x05138d91) OwnershipAssigned {
    queryId: Int as uint64;
    prevOwner: Address;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) Excesses {
    queryId: Int as uint64;
}

message(0x2fcb26a2) GetStaticData {
    queryId: Int as uint64;
}

message(0x8b771735) ReportStaticData {
    queryId: Int as uint64;
    index: Int as uint256;
    collection: Address;
}

message(0x693d3950) GetRoyaltyParams {
    queryId: Int as uint64;
}

message(0xa8cb00ad) ReportRoyaltyParams {
    queryId: Int as uint64;
    numerator: Int as uint16;
    denominator: Int as uint16;
    destination: Address;
}
