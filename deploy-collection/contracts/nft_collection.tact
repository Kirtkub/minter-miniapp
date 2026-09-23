import "@stdlib/content";
import "./messages.tact";
import "./nft_item.tact";

// TEP-62 NFT collection with TEP-66 royalties and Ed25519-gated minting.
//
// The collection's metadata (name/description/image) is off-chain, at
// `collectionContentUrl`. `metadataIndexUrl` points at a JSON array of per-item
// metadata URLs; it is stored here only for transparency/auditing — the contract
// never fetches it. Minting is authorized by a trusted off-chain signer that reads
// metadataIndex.json, enforces max-supply-per-item itself, and signs a `Mint`
// message with AUTHENTICATION_SIGNATURE_PRIVATE_KEY. The contract only checks that
// the signature matches the public key it stored at deploy time.
contract NftCollection {
    owner: Address;
    nextItemIndex: Int as uint256;
    collectionContentUrl: String;
    metadataIndexUrl: String;
    royaltyDestination: Address;
    authPublicKey: Int as uint256;
    mintedPerMetadataIndex: map<Int, Int>;

    const RoyaltyNumerator: Int = 200;
    const RoyaltyDenominator: Int = 1000;
    const ItemDeployValue: Int = ton("0.03");

    init(
        owner: Address,
        royaltyDestination: Address,
        authPublicKey: Int,
        collectionContentUrl: String,
        metadataIndexUrl: String,
    ) {
        self.owner = owner;
        self.nextItemIndex = 0;
        self.collectionContentUrl = collectionContentUrl;
        self.metadataIndexUrl = metadataIndexUrl;
        self.royaltyDestination = royaltyDestination;
        self.authPublicKey = authPublicKey;
        self.mintedPerMetadataIndex = emptyMap();
    }

    // Accepts a plain deploy transaction with no message body.
    receive() {}

    receive(msg: Mint) {
        require(now() <= msg.validUntil, "signature expired");

        let contentHash: Int = sha256(msg.contentUrl);
        // Tact's sha256(Slice) (HASHEXT_SHA256 under the hood) requires the slice's
        // bit length to be a multiple of 8, or it throws a cell-underflow exception.
        // metadataIndex(32) + contentHash(256) + address(267) + validUntil(32) +
        // nextItemIndex(256) = 843 bits, which is NOT byte-aligned, so we pad with
        // 5 zero bits to reach 848 bits (106 bytes). The off-chain signer must add
        // the exact same padding when computing the digest it signs.
        let signedData: Cell = beginCell()
            .storeUint(msg.metadataIndex, 32)
            .storeUint(contentHash, 256)
            .storeAddress(msg.newOwner)
            .storeUint(msg.validUntil, 32)
            .storeUint(self.nextItemIndex, 256)
            .storeUint(0, 5)
            .endCell();
        let digest: Int = sha256(signedData.asSlice());
        require(checkSignature(digest, msg.signature, self.authPublicKey), "invalid signature");

        let itemIndex: Int = self.nextItemIndex;
        let itemInit: StateInit = initOf NftItem(itemIndex, myAddress());
        let itemAddress: Address = contractAddress(itemInit);
        let content: Cell = createOffchainContent(msg.contentUrl);

        send(SendParameters{
            to: itemAddress,
            value: self.ItemDeployValue,
            bounce: true,
            body: Initialize{owner: msg.newOwner, content: content}.toCell(),
            code: itemInit.code,
            data: itemInit.data,
        });

        let mintedSoFar: Int? = self.mintedPerMetadataIndex.get(msg.metadataIndex);
        let minted: Int = 0;
        if (mintedSoFar != null) {
            minted = mintedSoFar!!;
        }
        self.mintedPerMetadataIndex.set(msg.metadataIndex, minted + 1);
        self.nextItemIndex = itemIndex + 1;
    }

    receive(msg: GetRoyaltyParams) {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            bounce: false,
            body: ReportRoyaltyParams{
                queryId: msg.queryId,
                numerator: self.RoyaltyNumerator,
                denominator: self.RoyaltyDenominator,
                destination: self.royaltyDestination,
            }.toCell(),
        });
    }

    get fun get_collection_data(): CollectionData {
        let content: Cell = createOffchainContent(self.collectionContentUrl);
        return CollectionData{
            nextItemIndex: self.nextItemIndex,
            collectionContent: content,
            ownerAddress: self.owner,
        };
    }

    get fun get_nft_address_by_index(index: Int): Address {
        let itemInit: StateInit = initOf NftItem(index, myAddress());
        return contractAddress(itemInit);
    }

    get fun get_nft_content(index: Int, individualContent: Cell): Cell {
        return individualContent;
    }

    get fun royalty_params(): RoyaltyParams {
        return RoyaltyParams{
            numerator: self.RoyaltyNumerator,
            denominator: self.RoyaltyDenominator,
            destination: self.royaltyDestination,
        };
    }

    get fun get_metadata_index_url(): String {
        return self.metadataIndexUrl;
    }

    get fun get_auth_public_key(): Int {
        return self.authPublicKey;
    }

    get fun get_minted_count(metadataIndex: Int): Int {
        let count: Int? = self.mintedPerMetadataIndex.get(metadataIndex);
        if (count != null) {
            return count!!;
        }
        return 0;
    }
}

struct CollectionData {
    nextItemIndex: Int;
    collectionContent: Cell;
    ownerAddress: Address;
}

struct RoyaltyParams {
    numerator: Int;
    denominator: Int;
    destination: Address;
}
